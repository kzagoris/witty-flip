# WittyFlip Implementation Plan

## Context

WittyFlip is an online document conversion service (DOCX->Markdown, DJVU->PDF, etc.) targeting organic search. The project has infrastructure in place (~20%) — database schema, Docker/Caddy config, TanStack Start routing, Tailwind CSS — but all business logic, API routes, UI components, and converter wrappers are empty placeholders (single comment lines or stub `<div>`s). This plan covers the full implementation from placeholders to a launchable product.

---

## Phase 1: Foundation (Dependencies, DB, Core Utilities)

### 1.1 Install Missing npm Dependencies

- **Modify:** `package.json`
- **Add:** `file-type` (magic bytes), `uuid` + `@types/uuid`, `node-cron` (cleanup scheduler), `marked` + `gray-matter` (blog), `@tailwindcss/typography` (blog prose), `pino` + `pino-pretty` (logging), `vitest` + `supertest` + `@types/supertest` (testing)
- **Add scripts:** `test` (`vitest run`), `test:watch` (`vitest`), `test:fixtures` (fixture/conversion quality suite)
- **Verify:** `npm install && npm run type-check`

### 1.2 Generate & Apply DB Migration

- Run `npm run db:generate` then `npm run db:migrate`
- Schema at `app/lib/db/schema.ts` is already complete
- **Verify:** Confirm 3 tables exist in `data/sqlite.db`

### 1.3 Conversion Definitions (`app/lib/conversions.ts`)

- Export `CONVERSION_TYPES` map keyed by slug (e.g. `docx-to-markdown`)
- Each entry: slug, sourceFormat, targetFormat, extensions, MIME types, toolName, SEO title/description/h1, format color, seoContent (300-500 words), FAQ array, relatedConversions
- Export helpers: `getConversionBySlug()`, `isValidConversionType()`, `getAllConversionTypes()`
- **Tests (`tests/unit/conversions.test.ts`):**
    - Lookup by slug returns correct conversion definition
    - All 7 conversion types are registered
    - Invalid slugs return undefined
    - Every entry has required SEO fields (title, description, h1, seoContent, FAQ)

### 1.4 File Validation (`app/lib/file-validation.ts`)

- `validateFile(buffer, declaredExtension, conversionType)` -> `{ valid, error? }`
- Magic bytes via `fileTypeFromBuffer()` from `file-type`
- Size check: 10MB max
- Special handling for text formats (.md, .tex, .html) — no magic bytes, validate extension + UTF-8
- Clear user-friendly error messages
- **Tests (`tests/unit/file-validation.test.ts`):**
    - Accepts valid magic bytes for each format (DOCX/ZIP, DJVU, EPUB/ZIP, ODT/ZIP)
    - Rejects spoofed extensions (e.g. .docx with PNG magic bytes)
    - Rejects files > 10MB
    - Handles zero-byte and truncated files
    - Accepts valid UTF-8 text for .md, .tex, .html formats
    - Returns user-friendly error messages

### 1.5 Rate Limiting (`app/lib/rate-limit.ts`)

- `checkRateLimit(ip)` -> `{ allowed, remaining, limit, resetAt }`
- `incrementRateLimit(ip)` — called only after successful free conversion
- Upsert pattern on `rate_limits` table, keyed by IP + UTC date
- `FREE_DAILY_LIMIT = 2`
- **Tests (`tests/unit/rate-limit.test.ts`):**
    - Returns correct remaining count after each increment
    - Resets at UTC midnight (different date key)
    - Increments only on explicit call (not on check)
    - Different IPs have independent quotas

### 1.6 Conversion Queue (`app/lib/queue.ts`)

- `enqueueJob(fileId)` — sets status to `queued`, calls `processQueue()`
- `processQueue()` — if `converting` count < 5, dequeue oldest `queued` job
- `startConversion(fileId)` — sets `converting`, calls converter, handles success/failure/timeout
- On success: status `completed`, set `expiresAt` = now + 1hr, increment rate limit if free
- On failure: status `failed`, do NOT consume quota
- On timeout (30s): kill subprocess, status `timeout`
- After each completion, call `processQueue()` again
- **Tests (`tests/unit/queue.test.ts`):**
    - Respects max 5 concurrent jobs
    - Times out after 30 seconds (mock timer)
    - Re-entrant guard prevents double-processing
    - Status transitions follow the lifecycle (queued → converting → completed/failed/timeout)
    - Failed jobs do not consume free quota
    - Calls `processQueue()` after each completion to drain the queue

### 1.7 Client IP Resolution (`app/lib/request-ip.ts`) — **new file**

- Shared helper used by upload, convert, rate-limit-status, and request logging
- Single-hop deployment assumption: trust `X-Forwarded-For` only when the direct peer address matches configured Caddy proxy addresses/CIDRs
- When trusted, read only the leftmost `X-Forwarded-For` value after trimming and IP validation
- When untrusted or malformed, ignore forwarded headers and fall back to the direct peer address
- Never read `X-Forwarded-For` directly inside route handlers
- **Tests (`tests/unit/request-ip.test.ts`):**
    - Ignores spoofed forwarded headers from untrusted peers
    - Accepts a valid single-hop Caddy header and returns the leftmost client IP
    - Falls back to remote address when header is missing or malformed

### 1.8 Test Harness & Config

- **Create:** `vitest.config.ts`, `tests/setup.ts`, `tests/helpers/create-test-app.ts`
- `vitest.config.ts` configures Node test environment, path aliases, setup file, and coverage exclusions for generated files
- `tests/setup.ts` creates isolated temp directories, resets mocks/timers, and tears down temp SQLite databases between tests
- `tests/helpers/create-test-app.ts` mounts both TanStack `createServerFn` handlers and raw h3 routes into one in-memory app for `supertest`
- Fixture suite runs separately from default unit/integration tests so `npm test` stays fast and `npm run test:fixtures` can require Docker/tools explicitly

---

## Phase 2: Converter Wrappers

### 2.1 Common Interface & Registry (`app/lib/converters/index.ts`)

- `Converter` interface with `convert(inputPath, outputPath) -> ConvertResult`
- `ConvertResult`: `{ success, outputPath, exitCode, errorMessage?, durationMs }`
- Shared `spawnWithTimeout(cmd, args, opts, timeoutMs)` helper using `child_process.spawn`
- `getConverter(toolName)` registry function

### 2.2 Pandoc (`app/lib/converters/pandoc.ts`)

- DOCX->MD: `pandoc input.docx -t markdown -o output.md`
- MD->PDF: `pandoc input.md -o output.pdf --pdf-engine=weasyprint`
- ODT->DOCX: `pandoc input.odt -o output.docx`

### 2.3 djvulibre (`app/lib/converters/djvulibre.ts`)

- DJVU->PDF: `ddjvu -format=pdf input.djvu output.pdf`

### 2.4 Calibre (`app/lib/converters/calibre.ts`)

- EPUB->MOBI: `ebook-convert input.epub output.mobi`

### 2.5 weasyprint (`app/lib/converters/weasyprint.ts`)

- HTML->PDF: `weasyprint input.html output.pdf`
- Security: no external resource fetching (SSRF protection)

### 2.6 pdflatex (`app/lib/converters/pdflatex.ts`) — **new file**

- LaTeX->PDF: `pdflatex -interaction=nonstopmode -output-directory=... input.tex`

### 2.7 LibreOffice (`app/lib/converters/libreoffice.ts`)

- ODT->DOCX fallback: `libreoffice --headless --convert-to docx`
- Lower priority — Pandoc is primary for this conversion

### 2.8 Converter Unit Tests (`tests/unit/converters/`)

Each converter wrapper gets a test file verifying (with mocked `child_process.spawn`):

- Builds the correct command and arguments for each conversion
- Handles non-zero exit codes (returns `{ success: false, errorMessage }`)
- Respects AbortSignal for cancellation
- Returns correct `ConvertResult` shape on success
- `getConverter(toolName)` returns the right converter for each registered tool name

---

## Phase 3: API Routes

### Architecture Decision

- **Server functions** (`createServerFn`): upload, convert, conversion-status, create-checkout
- **Raw h3 handlers**: download (binary streaming), webhook/stripe (raw body for signature)

### 3.1 Custom Server Entry (`app/server/entry.ts`) — **new file**

- Compose h3 router mounting download + webhook handlers
- Pass all other requests to TanStack Start's SSR handler
- Update `vite.config.ts` to reference custom entry

### 3.2 Upload (`app/server/api/upload.ts`)

- `createServerFn({ method: 'POST' })` accepting FormData
- Generate UUID via `crypto.randomUUID()`
- Validate file (size, magic bytes, conversion type)
- Save to `data/conversions/{uuid}.{ext}`
- Insert `conversions` row with status `uploaded`
- Resolve client IP via `app/lib/request-ip.ts`; never read `X-Forwarded-For` directly
- Return `{ fileId, status: 'uploaded' }`

### 3.3 Convert (`app/server/api/convert.ts`)

- `createServerFn({ method: 'POST' })` accepting `{ fileId }`
- Resolve client IP via shared helper, check rate limit, then enqueue or return `payment_required`

### 3.4 Conversion Status (`app/server/api/conversion-status.ts`)

- `createServerFn({ method: 'GET' })` accepting `{ fileId }`
- Return `{ fileId, status, downloadUrl?, expiresAt?, errorMessage? }`

### 3.5 Rate Limit Status (`app/server/api/rate-limit-status.ts`) — **new file**

- `createServerFn({ method: 'GET' })`
- Resolve client IP via shared helper and return `{ remaining, limit, resetAt }`
- Uses the same trusted-proxy policy as upload/convert so UI status matches enforcement

### 3.6 Download (`app/server/api/download.ts`)

- Raw h3 handler at `GET /api/download/:fileId`
- Stream output file with proper Content-Type + Content-Disposition
- Reject expired or non-completed files

---

## Phase 4: Payment Flow (Stripe)

### 4.1 Stripe Client (`app/lib/stripe.ts`)

- Initialize Stripe SDK
- `createCheckoutSession(fileId, conversionType, ip)` — guest mode, $0.49, 30min expiry
- `verifyWebhookSignature(rawBody, signature)`
- Insert `payments` row, update conversion to `pending_payment`

### 4.2 Create Checkout (`app/server/api/create-checkout.ts`)

- Server function: verify conversion is `payment_required`, create session, return URL

### 4.3 Stripe Webhook (`app/server/api/webhook/stripe.ts`)

- Raw h3 handler at `POST /api/webhook/stripe`
- Verify signature, handle `checkout.session.completed`
- Update payment + conversion records, enqueue job

### 4.4 Stripe Unit Tests (`tests/unit/stripe.test.ts`)

- Generates checkout session with correct amount ($0.49) and metadata (fileId, conversionType)
- Webhook signature verification rejects tampered payloads
- Idempotent handler ignores duplicate `checkout.session.completed` events
- `createCheckoutSession` only works for `payment_required` conversions

---

## Phase 5: UI Components

### 5.0 Design System (`app/styles/globals.css`)

- Google Fonts: Plus Jakarta Sans (headings), Inter (body)
- CSS variables for brand purple + 7 format colors
- Keyframe animations: pulse, slide-in, progress-bar, bounce, celebrate

### 5.1 Header (`app/components/Header.tsx`)

- Logo + "All Conversions" dropdown, responsive hamburger menu, sticky with backdrop blur

### 5.2 Footer (`app/components/Footer.tsx`)

- Privacy/Terms/Contact links, conversion links for SEO, trust signal

### 5.3 SEOHead (`app/components/SEOHead.tsx`)

- Open Graph, Twitter Cards, JSON-LD structured data (HowTo, SoftwareApplication, FAQPage)

### 5.4 FileUploader (`app/components/FileUploader.tsx`)

- Drag-and-drop + click to browse, format-specific accent color
- States: idle (pulse), dragging (highlight), uploading (progress), complete, error
- Client-side size/extension validation before upload
- Calls upload server function via FormData

### 5.5 ConversionProgress (`app/components/ConversionProgress.tsx`)

- Polls status every 1-2s while queued/converting
- Animated progress bar, format icon transformation animation

### 5.6 DownloadButton (`app/components/DownloadButton.tsx`)

- Bold button with bounce animation, green checkmark, expiry countdown timer

### 5.7 PaymentPrompt (`app/components/PaymentPrompt.tsx`)

- Rate limit message + "Pay & Convert" button -> Stripe Checkout redirect

### 5.8 AdBanner (`app/components/AdBanner.tsx`)

- AdSense wrapper, shown only for free conversions, dev placeholder until approval

### 5.9 ConversionCard (`app/components/ConversionCard.tsx`)

- Card with format color accent, source->target labels, hover scale effect

---

## Phase 6: Pages

### 6.1 Root Layout (`app/routes/__root.tsx`)

- Add Header + Footer wrapping Outlet, import globals.css, Google Fonts links

### 6.2 Homepage (`app/routes/index.tsx`)

- Gradient hero: "Free Online Document Converter"
- Grid of 7 ConversionCards, trust signals section
- SSR loader with conversion metadata

### 6.3 Conversion Landing Page (`app/routes/$conversionType.tsx`)

- SSR loader: look up conversion by slug, 404 if invalid
- State machine: idle -> uploaded -> queued/converting -> completed (or payment_required/failed)
- Layout per spec wireframe: H1, FileUploader, ConversionProgress/PaymentPrompt/DownloadButton, SEO content, FAQ, related conversions
- Handle Stripe return via URL params (fileId + session_id)
- Format-specific gradient background

### 6.4 404 Handling

- Invalid slugs return proper 404
- Known-but-unsupported formats show "Coming soon" with `noindex`

---

## Phase 7: Blog System

### 7.1 Blog Content (`content/blog/*.md`)

- 4 initial posts with frontmatter: title, description, date, slug, relatedConversion

### 7.2 Blog Post Route (`app/routes/blog/$slug.tsx`)

- Loader reads markdown, parses with gray-matter + marked
- Tailwind prose styling, related conversion CTA

### 7.3 Blog Index (`app/routes/blog/index.tsx`)

- Card grid of all posts from content/blog/

---

## Phase 8: Cleanup, Security, Observability, SEO Files

### 8.1 File Cleanup (`app/lib/cleanup.ts`) — **new file**

- `cleanupExpiredFiles()` — delete expired files, update status
- Never delete pending_payment/queued/converting jobs
- Run on startup for stale files from previous runs

### 8.2 Cron Scheduler

- Use `node-cron` to run cleanup every 15 minutes within Node process
- Also register `SIGTERM` handler for graceful shutdown cleanup

### 8.3 Security Headers (`Caddyfile`)

- HSTS, X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy
- Request body size limit: 11MB

### 8.4 robots.txt + sitemap.xml

- Static `public/robots.txt` pointing to sitemap
- Generated `sitemap.xml` listing all conversion pages + blog posts

### 8.5 Env Validation (`app/lib/env.ts`) — **new file**

- Validate STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, METRICS_API_KEY at startup

### 8.6 Structured Logging (`app/lib/logger.ts`) — **new file**

- **Library:** Pino (JSON output to stdout, collected by Docker)
- **Standard fields:** `timestamp` (ISO 8601), `level`, `msg`, `conversionId`, `requestId`, `ip` (hashed/truncated), `conversionType`, `durationMs`, `error`
- **Log points:**
    - Request received (info): method, path, IP
    - File uploaded (info): conversionId, format, file size
    - Rate limit checked (info): IP, remaining quota
    - Conversion started/completed (info): conversionId, tool name, duration, output size
    - Conversion failed (error): conversionId, tool exit code, error message
    - Payment received (info): conversionId, Stripe session ID, amount
    - File cleanup (info): number of files deleted, disk space reclaimed
- **Development:** Use `pino-pretty` for human-readable console output in dev mode

### 8.7 Health Check Endpoint (`app/server/api/health.ts`) — **new file**

- `GET /health` — returns `200 OK` when app is running and SQLite is accessible, `503` otherwise
- Response: `{ "status": "ok", "uptime": 3600 }`
- Used by UptimeRobot (free tier) for external monitoring
- Used by Docker `HEALTHCHECK` directive for container restart on failure

### 8.8 Metrics Endpoint (`app/server/api/metrics.ts`) — **new file**

- `GET /metrics` — protected by `Authorization: Bearer <METRICS_API_KEY>`
- Returns operational metrics:
    - **Disk:** `conversionsDir.usedBytes`, `totalBytes`, `usedPercent`, `fileCount`
    - **Queue:** `activeJobs`, `queuedJobs`, `maxConcurrent`
    - **Conversions (last 1h):** `total`, `successful`, `failed`, `timeout`, `successRate`, `avgDurationMs`, `lastSuccessfulAt`
    - **System:** `uptime`, `timestamp`
- `usedPercent` is filesystem-relative: `usedBytes / totalBytes * 100` for the mounted filesystem that contains `data/conversions`

### 8.9 Conversion Analytics

- The `conversions` table serves as the analytics store
- Key queries: success rate by format, average conversion time, error breakdown, paid vs free ratio, hourly/daily volume, slowest conversions
- No external dashboard for v1 — query SQLite directly via SSH

### 8.10 Alerting Script (`scripts/alert-check.ts`) — **new file**

- Lightweight Node.js script run on VPS via cron every 5 minutes
- Queries `/metrics` endpoint, sends email alerts via SMTP (Postmark free tier) when thresholds breached
- **Alert thresholds:**

| Condition                | Threshold                                            | Severity |
| ------------------------ | ---------------------------------------------------- | -------- |
| Disk usage               | > 80% of filesystem containing conversions directory | Critical |
| Queue depth              | > 20 queued jobs                                     | Warning  |
| Error rate               | > 25% of conversions in last hour                    | Critical |
| No successful conversion | > 30 min since last success (while jobs exist)       | Warning  |
| App down                 | /health returns non-200                              | Critical |

- **Deduplication:** Suppress repeated alerts for the same condition within a 1-hour window
- **Alert config env vars:** `ALERT_EMAIL_TO`, `ALERT_SMTP_HOST`, `ALERT_SMTP_PORT`, `ALERT_SMTP_USER`

---

## Phase 9: Testing & QA

### Testing Strategy

Unit tests are written alongside each module (Phases 1-4). Phase 9 focuses on cross-module integration tests, fixture-based conversion quality tests, and security tests that span the full pipeline. Browser-based E2E tests and CI automation are deferred to post-launch.

### Tooling

| Tool              | Purpose                                                                        |
| ----------------- | ------------------------------------------------------------------------------ |
| **Vitest**        | Unit and integration tests. Fast, Vite-native, compatible with TanStack Start. |
| **supertest**     | HTTP-level integration tests against API routes without a running server.      |
| **Fixture files** | Real sample documents per format pair for conversion quality validation.       |
| **Playwright**    | E2E browser tests (post-launch).                                               |

### 9.0 Test Harness

- Add `package.json` scripts: `npm test`, `npm run test:watch`, `npm run test:fixtures`
- Create `vitest.config.ts` for Node environment, setup hooks, aliases, and split fixture test inclusion
- Create `tests/setup.ts` to isolate temp directories, SQLite state, mocks, and fake timers
- Create `tests/helpers/create-test-app.ts` to exercise mixed TanStack `createServerFn` and raw h3 handlers in one app instance via `supertest`
- Keep fixture tests opt-in so the default test run does not require Docker conversion tools

### 9.1 Integration Tests

Test the API route flow end-to-end with a real SQLite database but mocked converter subprocesses:

| Flow                          | What It Covers                                                                                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Happy path**                | Upload file → convert → poll status until completed → download. Verify response shapes, status transitions, and Content-Disposition header.                    |
| **Rate limit enforcement**    | Two free conversions succeed. Third returns 402 with `payment_required`. Verify rate_limits row incremented correctly.                                         |
| **Paid conversion flow**      | Upload → convert (returns 402) → create-checkout → simulate webhook → verify conversion starts. Payment row created with correct status.                       |
| **Failed conversion**         | Mock converter returns non-zero exit code. Verify status=failed, error message present, free quota not consumed, no downloadable artifact.                     |
| **Timeout**                   | Mock converter exceeds 30s. Verify status=timeout, process killed, cleanup runs.                                                                               |
| **File validation rejection** | Upload with wrong magic bytes. Verify 400 error with clear message.                                                                                            |
| **Concurrent queue limit**    | Enqueue 6 jobs. Verify 5 run concurrently, 6th remains queued.                                                                                                 |
| **Download expiry**           | Set expires_at in the past. Verify download returns 404/410.                                                                                                   |
| **Rate limit status**         | Call `GET /api/rate-limit-status`. Verify `{ remaining, limit, resetAt }` matches current DB state for the resolved client IP.                                 |
| **Trusted proxy handling**    | Spoof `X-Forwarded-For` from an untrusted peer and verify it is ignored. Send the same header from a trusted Caddy peer and verify the leftmost value is used. |

### 9.2 Fixture Tests (Conversion Quality)

Fixture files committed to `tests/fixtures/{conversion-type}/`. Each of the 7 format pairs has a fixture matrix:

| Fixture Type                  | Purpose                                                          |
| ----------------------------- | ---------------------------------------------------------------- |
| Simple text-only              | Baseline: plain paragraphs convert correctly                     |
| Headings + lists              | Structure preservation (H1-H3, ordered/unordered lists)          |
| Tables / structured content   | Table rendering in target format                                 |
| Embedded images / attachments | Image extraction or embedding where the format supports it       |
| Corrupted / invalid file      | Converter fails gracefully with a clear error, no partial output |

**Pass criteria:**

- Conversion completes within 30 seconds for files under 10MB
- Output opens in the target format's standard reader/editor
- Text-based conversions preserve primary document text and structure
- Failed conversions surface a clear message and leave no downloadable artifact

### 9.3 Observability Tests

| Surface                       | What It Covers                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **`GET /health`**             | Returns 200 when app + SQLite are healthy and 503 when DB access fails.                                                      |
| **`GET /metrics` auth**       | Rejects missing/invalid bearer tokens and accepts the configured API key.                                                    |
| **Metrics shape + disk math** | Validates response shape, `totalBytes`, and filesystem-relative `usedPercent` against mocked filesystem stats.               |
| **Structured logs**           | Verifies standard log field shape and redaction/truncation of IPs, auth headers, Stripe secrets, and other sensitive values. |
| **Alert deduplication**       | Threshold breach sends one alert, repeats are suppressed for 1 hour, then alerting resumes after the dedupe window.          |

### 9.4 Security Testing

- Magic byte spoofing (wrong extension with valid magic bytes)
- Oversized files (> 10MB)
- Path traversal in filenames
- Spoofed proxy headers from untrusted clients
- Invalid Stripe webhook signatures
- Expired download attempts
- SSRF via HTML→PDF external resource fetching

### 9.5 Test Execution

All v1 tests run locally. No CI pipeline required for v1.

```bash
npm test              # Run all unit + integration tests
npm run test:fixtures # Run fixture/conversion quality tests (requires Docker with conversion tools)
```

### 9.6 Post-Launch Testing

| Addition                   | When                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **E2E browser tests**      | After UI is stable. Playwright tests covering: upload drag-and-drop, progress polling, download, payment prompt, mobile viewport. |
| **CI pipeline**            | After launch. GitHub Actions with Docker-based runner for integration + fixture tests on every PR.                                |
| **Load testing**           | After initial traffic. Validate VPS handles concurrent uploads and conversions under realistic load.                              |
| **UI/UX + mobile testing** | All 6 interaction states, mobile viewports (375px, 768px), Lighthouse Core Web Vitals.                                            |

---

## Dependency Graph

```
Phase 1 (Foundation)
  |
  v
Phase 2 (Converters)
  |
  v
Phase 3 (API Routes) -----> Phase 4 (Payments)
  |                              |
  |   Phase 5 (UI Components) <--+  (can parallel with Phase 4)
  |          |
  |          v
  |     Phase 6 (Pages)
  |          |
  |          v
  |     Phase 7 (Blog)
  |
  +--> Phase 8 (Cleanup/Security/Observability)  (can start after Phase 3)
                |
                v
           Phase 9 (Testing & QA)  (requires all phases)

Note: Unit tests for each module should be written alongside
implementation (Phases 1-4), not deferred to Phase 9. Phase 9
covers integration tests, fixture tests, and security testing
that span multiple modules.
```

## Key Files to Modify/Create

| File                                  | Action            | Phase |
| ------------------------------------- | ----------------- | ----- |
| `package.json`                        | Modify (add deps) | 1     |
| `app/lib/conversions.ts`              | Implement         | 1     |
| `app/lib/file-validation.ts`          | Implement         | 1     |
| `app/lib/rate-limit.ts`               | Implement         | 1     |
| `app/lib/queue.ts`                    | Implement         | 1     |
| `app/lib/converters/index.ts`         | Implement         | 2     |
| `app/lib/converters/pandoc.ts`        | Implement         | 2     |
| `app/lib/converters/djvulibre.ts`     | Implement         | 2     |
| `app/lib/converters/calibre.ts`       | Implement         | 2     |
| `app/lib/converters/weasyprint.ts`    | Implement         | 2     |
| `app/lib/converters/pdflatex.ts`      | **Create**        | 2     |
| `app/lib/converters/libreoffice.ts`   | Implement         | 2     |
| `app/server/entry.ts`                 | **Create**        | 3     |
| `app/server/api/upload.ts`            | Implement         | 3     |
| `app/server/api/convert.ts`           | Implement         | 3     |
| `app/server/api/conversion-status.ts` | Implement         | 3     |
| `app/server/api/rate-limit-status.ts` | **Create**        | 3     |
| `app/server/api/download.ts`          | Implement         | 3     |
| `app/lib/stripe.ts`                   | Implement         | 4     |
| `app/server/api/create-checkout.ts`   | Implement         | 4     |
| `app/server/api/webhook/stripe.ts`    | Implement         | 4     |
| `app/styles/globals.css`              | Implement         | 5     |
| `app/components/*.tsx` (9 files)      | Implement         | 5     |
| `app/routes/__root.tsx`               | Modify            | 6     |
| `app/routes/index.tsx`                | Implement         | 6     |
| `app/routes/$conversionType.tsx`      | Implement         | 6     |
| `app/routes/blog/$slug.tsx`           | **Create**        | 7     |
| `app/routes/blog/index.tsx`           | **Create**        | 7     |
| `content/blog/*.md` (4 files)         | **Create**        | 7     |
| `app/lib/cleanup.ts`                  | **Create**        | 8     |
| `app/lib/env.ts`                      | **Create**        | 8     |
| `app/lib/request-ip.ts`               | **Create**        | 1, 3  |
| `app/lib/logger.ts`                   | **Create**        | 8     |
| `app/server/api/health.ts`            | **Create**        | 8     |
| `app/server/api/metrics.ts`           | **Create**        | 8     |
| `scripts/alert-check.ts`              | **Create**        | 8     |
| `Caddyfile`                           | Modify            | 8     |
| `public/robots.txt`                   | **Create**        | 8     |
| `vite.config.ts`                      | Modify            | 3     |
| `vitest.config.ts`                    | **Create**        | 1, 9  |
| `tests/setup.ts`                      | **Create**        | 1, 9  |
| `tests/helpers/create-test-app.ts`    | **Create**        | 1, 9  |
| `tests/fixtures/{conversion-type}/`   | **Create**        | 9     |

## Verification

1. **Per-phase:** Each phase has its own verification steps (see details above)
2. **Full E2E:** After all phases, run `docker compose up --build` and test the complete flow: visit `/docx-to-markdown`, upload a file, watch conversion, download result, exhaust free quota, pay via Stripe test mode, verify paid conversion works
3. **SEO check:** Validate SSR output with `curl`, check structured data with Google's Rich Results Test, run Lighthouse
