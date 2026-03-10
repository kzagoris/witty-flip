# Phase 8: Cleanup, Security, Observability, SEO Files

## Context

Phases 1-6 are complete. Phase 7 (blog) is deferred. This plan adds the operational readiness layer for launch: automated file cleanup, crash recovery, structured logging, environment validation, security headers, observability endpoints, schema hardening, and SEO files.

---

## Dependencies to Install

**Production:** `pino`, `node-cron`
**Dev:** `pino-pretty`

Note: `nodemailer` is NOT needed — the alert script is a standalone C# AOT binary (see §11).

---

## Implementation Order

```
Step 1:  Schema migration (add outputFilePath column)
Step 2:  app/lib/env.ts (new)
Step 3:  app/lib/logger.ts (new)
Step 4:  app/lib/cleanup.ts (new)
Step 5:  app/lib/server-runtime.ts (modify: env, logger, cron, cleanup, crash recovery)
Step 6:  app/lib/queue.ts (modify: export const, persist outputFilePath)
Step 7:  app/server/api/status-utils.ts (modify: use outputFilePath)
Step 8:  app/routes/api/download/$fileId.tsx (modify: use outputFilePath)
Step 9:  app/routes/api/health.tsx (keep as liveness, no DB check)
Step 10: app/routes/api/health/ready.tsx (new: readiness with DB check)
Step 11: app/routes/api/metrics.tsx (new: protected stats endpoint)
Step 12: app/routes/api/sitemap[.]xml.tsx (new: dynamic sitemap from registry + BASE_URL)
Step 13: public/robots.txt (new static file)
Step 14: Caddyfile (modify: security headers + body limit)
Step 15: tools/alert-check/ (new: C# AOT console app)
Step 16: Config updates (package.json, .env.example, docker-compose.yml)
Step 17: Tests + test harness update
```

---

## Step 1: Schema Migration

Add `outputFilePath` to the `conversions` table so cleanup/download/status don't recompute paths from slugs.

**`app/lib/db/schema.ts`** — add after `inputFileSizeBytes` (line 38):
```typescript
outputFilePath: text('output_file_path'),  // nullable, set on successful conversion
```

Run `npm run db:generate` then `npm run db:migrate` to produce and apply the migration.

**Why:** The download route (`$fileId.tsx:163`) and status-utils (`status-utils.ts:55`) both call `getConversionBySlug()` + `getStoredOutputPath()` to reconstruct the output path. If a slug is renamed or a converter is disabled, this breaks. Persisting the path at conversion time makes these reads resilient.

---

## Step 2: `app/lib/env.ts` (NEW)

Validate critical env vars at startup. Fail fast in production, warn in dev.

```typescript
export function validateEnv(): void
```

- **Required in production (`NODE_ENV=production`):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- **Optional (warn if missing):** `METRICS_API_KEY`
- **Defaults:** `DATABASE_URL` → `'file:./data/sqlite.db'`, `BASE_URL` → `'http://localhost:3000'`
- Uses `console.warn` (not logger — logger may not be initialized yet)
- Does NOT replace existing `process.env` reads in `stripe.ts` or `db/index.ts` — just adds startup-time validation

---

## Step 3: `app/lib/logger.ts` (NEW)

Pino structured logging singleton. **Infrastructure only in this phase** — only `cleanup.ts` and `server-runtime.ts` adopt it. Other modules (upload, convert, queue, stripe) adopt it in a follow-up. Acceptance criteria are scoped accordingly.

```typescript
export const logger: Logger
export function createChildLogger(bindings: Record<string, unknown>): Logger
```

- JSON to stdout in production; `pino-pretty` in dev via `transport` option (only when `NODE_ENV !== 'production'`)
- `pino.stdTimeFunctions.isoTime` for ISO timestamps
- Level from `LOG_LEVEL` env var, defaults to `'debug'` (dev) / `'info'` (prod)
- `pino-pretty` is a devDependency — unavailable in production Docker image (`npm ci --production`), so the transport must only be set in dev mode

---

## Step 4: `app/lib/cleanup.ts` (NEW)

```typescript
export async function cleanupExpiredFiles(): Promise<{ cleaned: number; errors: number }>
```

### Cleanup ownership boundaries

| Status | Who cleans output? | Who cleans input? | When? |
|--------|-------------------|-------------------|-------|
| `completed` → expired | **cleanup.ts** | **cleanup.ts** | When `expiresAt <= now` |
| `failed` / `timeout` | **queue.ts** (immediate, via `cleanupOutputArtifacts`) | **cleanup.ts** | After 1 hour (`conversionCompletedAt <= now - 1hr`) |
| `queued` / `converting` / `pending_payment` | NEVER | NEVER | — |
| `expired` (already marked) | **cleanup.ts** (best-effort re-scan) | **cleanup.ts** (best-effort) | On startup or cron |

### Concurrency guard

Use a module-level `isRunning` boolean to prevent startup cleanup and cron from overlapping. If already running, skip silently.

### Missing files

`fs.rm({ force: true })` — if file is already gone, no error. Log a debug message, still update DB status.

### Edge cases

- `data/conversions` directory missing on startup: call `ensureConversionsDir()` from `app/lib/conversion-files.ts` before scanning
- Symlinks / subdirectories in conversions dir: `readdir` + `stat` with `isFile()` check; skip non-regular files
- Use `conversion.outputFilePath` (the new column) when available; fall back to `getStoredOutputPath()` for rows created before the migration

### Stale `pending_payment` cleanup

Also clean up `pending_payment` conversions whose associated Stripe checkout has expired (>30 min old, no payment completed). Query: `status = 'pending_payment' AND created_at <= now - 2hr`. Set status to `expired`, delete input file.

### Orphan files

On startup only (not on cron — too expensive): scan `data/conversions/` for files whose UUID prefix doesn't match any `conversions.id` row. Log them as warnings but do NOT auto-delete in v1. This surfaces issues without risking data loss.

---

## Step 5: `app/lib/server-runtime.ts` (MODIFY)

**Current:** 10 lines, calls `registerAllConverters()`.

**After:** Wire in env validation, logger, cron, cleanup, and crash recovery.

```typescript
export function initializeServerRuntime(): void {
  if (initialized) return
  initialized = true
  validateEnv()
  registerAllConverters()
  void recoverStaleJobs()         // crash recovery
  void cleanupExpiredFiles()      // startup cleanup
  startCleanupCron()              // schedule */15 * * * *
  logger.info('Server runtime initialized')
}

export function shutdownServerRuntime(): void   // stop cron, log shutdown
```

### Crash recovery (`recoverStaleJobs`)

On startup, find jobs stuck in `queued` or `converting` (left over from a previous crash/deploy):

1. Query `status IN ('queued', 'converting')`
2. For each: set `status = 'failed'`, `errorMessage = 'Server restarted during conversion.'`, `conversionCompletedAt = now`
3. Release their reserved rate-limit slots via `releaseRateLimitSlot(ip, rateLimitDate)`
4. Delete partial output artifacts via `fs.rm({ force: true })`
5. Log count of recovered jobs

### SIGTERM handler

```typescript
process.on('SIGTERM', () => { shutdownServerRuntime(); process.exit(0) })
```

### Cron

Dynamic `import('node-cron')` to avoid loading in test environments. Cron calls `cleanupExpiredFiles()` every 15 minutes; logs only when `cleaned > 0` or `errors > 0`.

---

## Step 6: `app/lib/queue.ts` (MODIFY)

Two changes:

### 6a. Export `MAX_CONCURRENT_JOBS` (line 12)

```diff
-const MAX_CONCURRENT_JOBS = 5
+export const MAX_CONCURRENT_JOBS = 5
```

### 6b. Persist `outputFilePath` on successful conversion

In `runConversion()`, after a successful conversion (line 173 area), add `outputFilePath` to the DB update:

```typescript
.set({
  status: 'completed',
  outputFilePath: resultOutputPath,  // NEW — persist the actual output path
  // ... existing fields
})
```

Where `resultOutputPath = result.outputPath || outputPath` (already computed at line 145).

---

## Step 7: `app/server/api/status-utils.ts` (MODIFY)

In `buildConversionStatusPayload()`, when checking if the output artifact exists for `completed` status (line 42-72):

**Before:** Calls `getConversionBySlug(conversion.conversionType)` then `getStoredOutputPath()`
**After:** Use `conversion.outputFilePath` when available, fall back to the computed path for backward compatibility with pre-migration rows.

```typescript
// Replace lines 43-56 with:
const outputPath = conversion.outputFilePath
  ?? (conversionMeta ? getStoredOutputPath(conversion.id, conversionMeta.targetExtension) : null)
if (!outputPath) { /* return failed */ }
await fs.access(outputPath)
```

Update the `ConversionStatusRecord` interface to include `outputFilePath: string | null`.

---

## Step 8: `app/routes/api/download/$fileId.tsx` (MODIFY)

Same pattern — use `conversion.outputFilePath` when available (line 163):

```typescript
// Before:
const outputPath = getStoredOutputPath(fileId, conversionMeta.targetExtension)

// After:
const outputPath = conversion.outputFilePath
  ?? getStoredOutputPath(fileId, conversionMeta.targetExtension)
```

Still need `conversionMeta` for `targetMimeType` and `targetExtension` (used in Content-Type and filename sanitization), so the `getConversionBySlug` call stays — but the file path is resilient.

---

## Step 9: `app/routes/api/health.tsx` — Keep as Liveness (NO CHANGE)

The current endpoint stays as-is: lightweight, no DB check, returns `{ status: 'ok' }`. Used by Docker `HEALTHCHECK` — must never cause restart loops from transient DB issues.

---

## Step 10: `app/routes/api/health/ready.tsx` (NEW)

Readiness probe with DB check. Used by UptimeRobot / monitoring / the alert script.

```typescript
export async function handleReadinessRequest(): Promise<Response>
```

- Run `SELECT 1` against SQLite
- **200:** `{ status: 'ok', uptime: <seconds>, timestamp: <ISO>, dbLatencyMs: <ms> }`
- **503:** `{ status: 'degraded', uptime: <seconds>, timestamp: <ISO> }` — NO raw DB error details in production
- Add `Cache-Control: no-store` header

---

## Step 11: `app/routes/api/metrics.tsx` (NEW)

Protected observability endpoint — file-based route handler.

```typescript
export async function handleMetricsRequest(request: Request): Promise<Response>
```

### Auth

- Parse `Authorization` header; handle malformed values (not just missing)
- 401 on missing/wrong/malformed Bearer token
- 503 if `METRICS_API_KEY` not configured
- Add `Cache-Control: no-store` header

### Response shape

```json
{
  "disk": { "usedBytes": 0, "totalBytes": 0, "usedPercent": 0, "fileCount": 0 },
  "queue": { "activeJobs": 0, "queuedJobs": 0, "maxConcurrent": 5 },
  "conversions": {
    "last1h": { "total": 0, "successful": 0, "failed": 0, "timeout": 0, "successRate": 100, "avgDurationMs": 0 },
    "lastSuccessfulAt": null
  },
  "system": { "uptime": 0, "timestamp": "..." }
}
```

### Zero-conversions edge behavior

When `total = 0` in the last hour: `successRate = 100` (no failures), `avgDurationMs = 0`, `lastSuccessfulAt = null` (query all time, not just last hour).

### Implementation

- **Disk stats:** `readdir` + `stat` for file count/bytes; skip non-regular files (symlinks, subdirs). `fs.statfs` for filesystem-level totals. Wrap in try/catch (statfs may behave differently on Windows dev).
- **Queue stats:** Query DB for `status = 'converting'` / `status = 'queued'` counts. Import `MAX_CONCURRENT_JOBS` from `queue.ts`.
- **Conversion stats:** Query terminal statuses in last 1 hour by `conversionCompletedAt`.
- **lastSuccessfulAt:** Query ALL completed conversions (not just last hour) for the most recent `conversionCompletedAt`.
- Run all three queries in `Promise.all()`.

### Rate limiting

Health and metrics endpoints should NOT be throttled by the general 10 req/min/IP request limiter. These are infrastructure endpoints called by monitoring tools. Skip `checkAndConsumeRequestRateLimit` in their handlers (the current health.tsx already doesn't call it; metrics.tsx should follow the same pattern).

---

## Step 12: `app/routes/api/sitemap[.]xml.tsx` (NEW)

Dynamic route handler that generates sitemap XML from the conversion registry + `BASE_URL` env var. Avoids hardcoding `wittyflip.com` (domain not finalized per spec).

```typescript
export async function handleSitemapRequest(): Promise<Response>
```

- Read `BASE_URL` from `process.env` (defaults to `'https://wittyflip.com'`)
- Call `getAllConversionTypes()` from `app/lib/conversions.ts` to get all 7 slugs
- Include all 7 conversions (including html-to-pdf)
- Generate XML with `Content-Type: application/xml`
- Add `Cache-Control: public, max-age=86400` (1 day)

---

## Step 13: `public/robots.txt` (NEW)

```
User-agent: *
Allow: /
Disallow: /api/

Sitemap: https://wittyflip.com/sitemap.xml
```

Note: `Disallow: /api/` prevents crawling of API endpoints. The Sitemap URL uses the canonical domain; if the domain changes before launch, update this file.

---

## Step 14: `Caddyfile` (MODIFY)

```caddy
wittyflip.com {
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://api.stripe.com; frame-src https://js.stripe.com; frame-ancestors 'none'"
        -Server
    }

    request_body {
        max_size 11MB
    }

    reverse_proxy app:3000
}
```

**Key decisions:**
- **No `preload`** on HSTS — domain/subdomain policy not finalized; preload is hard to undo
- **CSP includes:** `js.stripe.com` (Checkout redirect), `api.stripe.com` (connect), Google Fonts CDN, `'unsafe-inline'` for scripts (TanStack SSR hydration) and styles (Tailwind). Tighten later when adding AdSense.
- **11MB** body limit (10MB file + form overhead)

---

## Step 15: `tools/alert-check/` (NEW — C# AOT Console App)

Self-contained .NET AOT binary that runs on the VPS host via system crontab. No Node.js required on the host.

### Project structure

```
tools/alert-check/
├── alert-check.csproj
├── Program.cs
└── README.md
```

### `alert-check.csproj`

Minimal .NET 9 console project with PublishAot enabled. Dependencies: `System.Net.Http` (built-in), `System.Net.Mail` (built-in), `System.Text.Json` (built-in). No NuGet packages needed for basic SMTP + HTTP + JSON.

### `Program.cs`

1. **Fetch health:** `GET /api/health/ready` — if non-200, alert `app_down` and exit
2. **Fetch metrics:** `GET /api/metrics` with Bearer auth
3. **Check thresholds:** disk > 80%, queue > 20, error rate > 25%, no success > 30 min
4. **Send email:** `SmtpClient` with STARTTLS
5. **Dedup state:** JSON file at `data/alert-state.json`
   - Write state ONLY after successful email send (failed send must not suppress future alerts)
   - Handle corrupted/missing state file gracefully (treat as empty, log warning)
   - Atomic write: write to temp file, then rename

### Environment variables

`METRICS_URL`, `METRICS_API_KEY`, `HEALTH_URL`, `ALERT_EMAIL_TO`, `ALERT_SMTP_HOST`, `ALERT_SMTP_PORT`, `ALERT_SMTP_USER`, `ALERT_SMTP_PASS`, `ALERT_EMAIL_FROM`, `ALERT_STATE_FILE`

### Build & deploy

```bash
cd tools/alert-check
dotnet publish -c Release  # produces self-contained binary
scp bin/Release/net9.0/linux-x64/publish/alert-check user@vps:/opt/wittyflip/
```

### VPS crontab

```
*/5 * * * * /opt/wittyflip/alert-check >> /var/log/wittyflip-alerts.log 2>&1
```

---

## Step 16: Config Updates

### `package.json`

Add to `dependencies`: `pino`, `node-cron`
Add to `devDependencies`: `pino-pretty`

### `.env.example`

Add:
```
METRICS_API_KEY=change-me-to-a-random-secret
LOG_LEVEL=info
```

### `docker-compose.yml`

Add to app service environment:
```yaml
- METRICS_API_KEY=${METRICS_API_KEY}
```

---

## Step 17: Tests

### Modified: `tests/helpers/create-test-app.ts`

- Add `import('~/routes/api/metrics')` and `import('~/routes/api/health/ready')` to module imports
- Add `GET /api/metrics` and `GET /api/health/ready` route handlers
- Add `GET /api/sitemap.xml` route handler

### New: `tests/unit/cleanup.test.ts` (~10-12 tests)

- Deletes output + input files for expired completed conversions, updates status to `expired`
- Uses `outputFilePath` column when available, falls back to computed path
- Deletes input files for old (>1hr) failed/timeout conversions
- Cleans stale `pending_payment` older than 2 hours
- Skips `queued`, `converting` statuses
- Handles missing files gracefully (no throw)
- Concurrency guard prevents overlapping runs
- Handles missing `data/conversions` directory
- Skips symlinks / non-regular files
- Returns correct `{ cleaned, errors }` counts

### New: `tests/unit/env.test.ts` (~5-6 tests)

- Returns defaults for DATABASE_URL, BASE_URL
- Doesn't throw in dev when Stripe keys missing
- Throws in production when STRIPE_SECRET_KEY missing
- Warns when METRICS_API_KEY is not set

### New: `tests/unit/logger.test.ts` (~3-4 tests)

- Logger is a Pino instance
- `createChildLogger()` returns child with bindings
- Production mode = no transport; dev mode = pino-pretty

### New: `tests/unit/metrics.test.ts` (~10-12 tests)

- 401 on missing/wrong/malformed auth header
- 503 when METRICS_API_KEY not configured
- 200 with correct response shape when authenticated
- Correct queue counts from seeded DB rows
- Correct success rate / avgDurationMs / lastSuccessfulAt from seeded data
- Zero-conversions edge: successRate=100, avgDurationMs=0, lastSuccessfulAt=null
- Cache-Control: no-store header present
- Not throttled by request rate limiter

### New: `tests/unit/readiness.test.ts` (~3-4 tests)

- 200 with uptime/timestamp/dbLatencyMs when DB accessible
- 503 with no raw DB error details when DB query fails
- Cache-Control: no-store header present

### New: `tests/unit/crash-recovery.test.ts` (~4-5 tests)

- Resets stale `queued` jobs to `failed` on startup
- Resets stale `converting` jobs to `failed` on startup
- Releases reserved rate-limit slots for recovered jobs
- Deletes partial output artifacts
- Leaves `completed`, `pending_payment`, `uploaded` jobs untouched

### Modified: existing integration tests

- Add metrics endpoint to the test harness routes
- Add readiness endpoint to the test harness routes

**Total: ~38-45 new tests across 6-7 files**

---

## Verification

1. **Schema migration:** `npm run db:generate && npm run db:migrate` — new column appears
2. **Unit tests:** `npm test` — all existing 170 tests + ~40 new tests pass
3. **Type check:** `npm run type-check` — no errors
4. **Dev server:** `npm run dev` — Pino-pretty startup logs, cleanup cron schedules, crash recovery runs (no-op on clean state)
5. **Liveness:** `curl localhost:3000/api/health` → 200 `{ status: 'ok' }` (unchanged)
6. **Readiness:** `curl localhost:3000/api/health/ready` → 200 with uptime, dbLatencyMs
7. **Metrics (unauth):** `curl localhost:3000/api/metrics` → 401
8. **Metrics (auth):** `curl -H "Authorization: Bearer <key>" localhost:3000/api/metrics` → 200 with disk/queue/conversion stats; zero-conversion edge returns sensible defaults
9. **Sitemap:** `curl localhost:3000/sitemap.xml` → valid XML with BASE_URL-prefixed URLs for homepage + 7 conversions
10. **Robots:** `curl localhost:3000/robots.txt` → includes `Disallow: /api/`
11. **Docker build:** `docker compose up --build` succeeds
12. **Security headers:** `curl -I https://wittyflip.com/` → HSTS, X-Frame-Options, CSP, etc. present
13. **Alert binary:** `cd tools/alert-check && dotnet publish -c Release` compiles; binary runs and reports status
