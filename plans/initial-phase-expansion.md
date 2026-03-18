# Reach Expansion — Phase 9 Implementation Plan

## Scope

**This session implements Phase 9 (Core Image Foundation) only**, split into 3 execution batches for rollout safety. Phases 10-13 are outlined at the end for context but will be planned and executed in future sessions.

SEO content (paragraphs, FAQs, keywords) for all 9 image conversion pages will be drafted as part of implementation.

## Context

WittyFlip currently serves 7 niche server-side document conversions (~150K/mo search volume). The full reach expansion (`spec/SPEC-reach-expansion.md`) grows to 41 conversions (~8.95M/mo). Phase 9 establishes all new infrastructure and adds the first 9 client-side image conversions — the primary traffic engine (~6.85M/mo addressable searches).

---

## Key Architectural Decisions

### 1. `category` and `processingMode` are required fields

Both fields are **required** on the `ConversionType` interface (not optional). All 7 existing entries are backfilled immediately: 6 get `category: "document"`, `processingMode: "server"`; epub-to-mobi gets `category: "ebook"`, `processingMode: "server"`. This maintains type safety and matches the spec.

### 2. Rollout gating via 3 execution batches

Adding entries to `CONVERSION_TYPES` immediately affects:
- **Sitemap** (`sitemap[.]xml.tsx:9`): `getAllConversionTypes()` maps every entry to a URL
- **Metrics** (`metrics.tsx:331`): checks every `toolName` against the server-side converter registry — client-side entries would show as "missing tools" and mark converters as "down"
- **Header** (`Header.tsx:12`): `getConversionSummaries()` populates the dropdown
- **Homepage** (`index.tsx:7`): `getConversionSummaries()` populates the grid

To prevent breakage:
- **Batch A** (foundation infrastructure): DB schema, API endpoints, client converter code, rate-limit transaction support. Zero public-facing changes.
- **Batch B** (frontend): hooks, components. Still no new entries in the registry.
- **Batch C** (go live): Add 9 image entries, update sitemap/metrics/header/homepage, hub page, privacy page. All new entries start with `indexable: false` and are flipped to `true` only after browser QA + human copy review.

Each batch is a separate execution session verified independently before proceeding.

### 3. Token design: hashed active token + one-time recovery token + IP-or-cookie-gated status recovery

`client_conversion_attempts` gets `tokenHash TEXT` and nullable `recoveryToken TEXT`. The active mutation token is always validated via `SHA-256(token) === tokenHash`; the plaintext token is never re-derived from the hash.

**Normal path:** On `/start`, generate a random UUID token, store only `tokenHash`, and return the plaintext token to the client. The client stores that plaintext token in `sessionStorage` keyed by `attemptId`, which survives same-tab refreshes and same-tab Stripe redirects.

**Payment recovery path:** When payment transitions an attempt from `pending_payment` → `ready`, mint a fresh token, replace `tokenHash`, and store the plaintext token in `recoveryToken`. The `/status` endpoint may return that plaintext token exactly once after verifying ownership (see below): read `recoveryToken`, include it in the response, and clear the column in the same transaction. If `recoveryToken` has already been claimed, `/status` returns status without a token and the UI offers a restart.

**Reserved-attempt behavior:** `reserved` attempts do not replay plaintext tokens from the DB. Recovery before payment relies on `sessionStorage`; if the token is gone before payment, the user restarts the attempt.

**Ownership verification (IP + HMAC cookie fallback):** `/status` only returns `recoveryToken` when the requester proves ownership. This uses a two-tier check:

1. **Primary: IP match** — requesting IP matches `client_conversion_attempts.ip_address`. Covers the common case (same network, same session).
2. **Fallback: HMAC recovery cookie** — on `/start`, set an `HttpOnly; Secure; SameSite=Lax` cookie named `wf_attempt_{attemptId}` containing `HMAC-SHA256(attemptId, SERVER_SECRET)`. The cookie has no `Max-Age` (session cookie — cleared when browser closes, matching the attempt lifecycle). On `/status`, if IP doesn't match, verify the cookie HMAC. This handles the edge case where Stripe checkout returns on a different IP (mobile carrier NAT, VPN reconnection, corporate proxy rotation).

Without either proof, an attacker guessing `attemptId` cannot retrieve a mutation credential. Any transition out of `ready` clears any leftover `recoveryToken`. The `SERVER_SECRET` for HMAC uses a dedicated `RECOVERY_COOKIE_SECRET` env var. This secret is required in production and must not be the same as `STRIPE_SECRET_KEY` — coupling them would mean a Stripe key rotation invalidates all outstanding recovery cookies, and vice versa. In development, a hardcoded fallback is used when the env var is not set.

**Idempotency guards:**
- `/complete`: If attempt is already `completed`, return success without re-consuming quota (check status in SQL WHERE clause)
- `/fail`: If attempt is already `failed`, return success without double-releasing
- Both use `db.transaction(async (tx) => { ... })` wrapping the status UPDATE + quota consume/release to ensure atomicity

**Rate-limit transaction support:** `reserveRateLimitSlot`, `consumeRateLimitSlot`, and `releaseRateLimitSlot` in `app/lib/rate-limit.ts` currently use the module-level `db` directly. Add an optional `executor` parameter so all quota mutations can participate in external transactions. Define a `DbExecutor` type extracted from Drizzle's transaction callback:
```typescript
// app/lib/db/index.ts — export the executor type
type TransactionCallback = Parameters<typeof db.transaction>[0]
export type DbExecutor = Parameters<TransactionCallback>[0]

// app/lib/rate-limit.ts
export async function reserveRateLimitSlot(ip: string, date?: string, executor: DbExecutor = db): Promise<RateLimitReservation>
export async function consumeRateLimitSlot(ip: string, date: string, executor: DbExecutor = db): Promise<void>
export async function releaseRateLimitSlot(ip: string, date: string, executor: DbExecutor = db): Promise<void>
```
Existing call sites (`queue.ts:34`, `server-runtime.ts:38`, `convert.ts:217`) are unchanged — they omit the parameter and get the default `db`. The new client-conversion endpoints pass `tx` from within their `db.transaction()` block. This lets `/start` perform `reserve slot + insert attempt` atomically, so a failed insert cannot orphan a reservation.

### 3b. `ConversionType` becomes a discriminated union

Instead of making `toolName` optional everywhere, split the model into `ServerConversionType` and `ClientConversionType`, keyed by `processingMode`:
- `processingMode: "server"` requires `toolName`
- `processingMode: "client"` requires `clientConverter` and may define `clientConverterEnhanced`
- client entries use `toolName?: never`; server entries use `clientConverter?: never`

`getServerConversions()` and `getClientConversions()` then return correctly narrowed arrays, so `metrics.tsx` can safely call `getServerConversions().map(c => c.toolName)` without undefined checks.

### 4. Payment/recovery wiring for client-side attempts

The existing URL search params and route state are `fileId`-shaped. Client-side conversions need a parallel `attemptId` path:

- `$conversionType.tsx` search schema adds optional `attemptId` alongside existing `fileId`
- `conversion-route-state.ts` gets a parallel `deriveClientConversionRouteState()` that reads `attemptId` + `session_id` + `canceled`
- Stripe checkout return URLs use `attemptId` instead of `fileId` for client-side payments
- `ClientConversionPage` reads `attemptId` from search params for Stripe return recovery
- `ServerConversionPage` continues using `fileId` untouched

### 5. Schema semantics for mixed server/client payments and events

**Payments table:** Make `fileId` **nullable** (migration: `ALTER TABLE payments ADD COLUMN file_id_new TEXT; UPDATE payments SET file_id_new = file_id;` then recreate table — or use Drizzle's migration generator). Add `clientAttemptId TEXT` (nullable). Add a SQLite `CHECK` constraint enforcing exactly one is set:
```sql
CHECK (
  (file_id IS NOT NULL AND client_attempt_id IS NULL) OR
  (file_id IS NULL AND client_attempt_id IS NOT NULL)
)
```
This replaces the previous app-level-only enforcement with a DB-level guarantee. No rename of existing column (avoids breaking migration).

**Payment triggers update:** Existing payment triggers use `NEW.file_id` to write to `conversion_events`. Update them to use `COALESCE(NEW.file_id, NEW.client_attempt_id)` as the event reference key. This one-line change per trigger keeps the audit trail working for both server and client payments.

> **Deliberate spec deviation:** The spec (`SPEC-reach-expansion.md`) suggests migrating `fileId` → `conversionId` in the payments table. We intentionally keep `fileId` and add `clientAttemptId` instead to avoid a risky rename migration on a live table. The spec's intent (linking payments to either server or client conversions) is achieved without the rename.

**Conversion events table:** Reuse `fileId` column as a generic reference key (it stores attempt IDs for client events). Add `eventSource TEXT DEFAULT 'server'` column (values: `'server'` | `'client'`). Existing triggers continue to work for server-side; new triggers for `client_conversion_attempts` write with `eventSource = 'client'`.

### 6. Metrics converter check: server-only

Update `metrics.tsx:331` to use `getServerConversions().map(c => c.toolName)`. Client-side conversions don't register in the server converter registry and must not trigger a "missing tools" alert. Add a separate `clientConversions` metrics section pulling from `client_conversion_attempts`.

### 7. Indexing gate

All new entries start with `indexable: false`. Sitemap filters on `indexable !== false`. An entry is flipped to `indexable: true` only after:
- Working converter verified in Chrome, Firefox, Safari, Edge
- Human-reviewed SEO copy (title, description, h1, seoContent, FAQ)
- Acceptable output quality on real sample files
- No experimental/beta label

---

## Batch A: Foundation Infrastructure

Zero public-facing changes. Can be deployed and tested without affecting any existing functionality.

> **Execution note:** Batch A is self-contained and should be verified independently (type-check + tests) before starting Batch B. Each batch is a separate execution session.

### Step A1 — Extend ConversionType interface + backfill existing entries

**Files:**
- `app/lib/conversions.ts` — Make `category` and `processingMode` required; split `ConversionType` into `ServerConversionType | ClientConversionType`; add `clientConverterEnhanced?`, `maxFileSizeMB?`, `estimatedSearchVolume?`, `supportsPasteInput?`, `launchPhase?`, `indexable?` as optional; backfill all 7 existing entries as server conversions; add helpers `getConversionsByCategory()`, `getServerConversions()`, `getClientConversions()`, `getIndexableConversions()`
- `app/lib/conversion-summaries.ts` — Add required `category` field to `ConversionSummary`; backfill 7 existing; add `getConversionSummariesByCategory()`

**Do NOT add image entries yet** — just interface + backfill + helpers.

**Test mocking strategy:** No `_testRegisterConversion` / `_testUnregisterConversion` — zero test code in production `conversions.ts`. Use standard `vi.mock()` pattern (consistent with existing Stripe, spawn-helper mocks).

**Test mocking approach:** Tests that need client conversion entries use the real registry (9 image entries are present after Batch C) or the lazy-loaded dependency injection pattern from the server function 3-layer architecture. Server function unit tests mock individual deps via `vi.hoisted()` + `vi.mock()` at the module top level — not wrapped in a function, since Vitest hoists `vi.mock()` calls at transform time.

**Tests:** Update `tests/unit/conversions.test.ts` — verify all 7 have required fields, test new helpers return correct counts, assert `getServerConversions()` returns only server-mode entries with `toolName`, assert `getClientConversions()` returns empty (no client entries in Batch A).

### Step A2 — Database schema: `client_conversion_attempts` table + payment/event columns

**Files:**
- `app/lib/db/schema.ts` — Add `clientConversionAttempts` table, add `clientAttemptId` to `payments`, add `category` to `conversions`, add `eventSource` to `conversionEvents`
- Run `npm run db:generate` for migration
- `tests/helpers/test-env.ts` — Add new table SQL + triggers to `setupTestDb()`

**`client_conversion_attempts` schema:**
```
id TEXT PK
conversion_type TEXT NOT NULL
category TEXT NOT NULL
ip_address TEXT NOT NULL
input_mode TEXT NOT NULL            -- "file" | "paste"
original_filename TEXT
input_size_bytes INTEGER
output_size_bytes INTEGER
output_filename TEXT
output_mime_type TEXT
token_hash TEXT NOT NULL            -- SHA-256 of the plaintext token
recovery_token TEXT                 -- nullable one-time plaintext token for post-payment recovery; cleared after first /status return
rate_limit_date TEXT
was_paid INTEGER DEFAULT 0
status TEXT NOT NULL DEFAULT 'reserved'
error_code TEXT
error_message TEXT
duration_ms INTEGER
started_at TEXT DEFAULT datetime('now')
completed_at TEXT
expires_at TEXT NOT NULL            -- 30 minutes from creation; extended to a fresh 30-minute window when payment completes
```

**Indexes:**
- `(status, expires_at)` — used by cleanup cron to find expired attempts without a full table scan
- `(ip_address, started_at)` — used by analytics and abuse-detection queries

**Payments update:** Make `fileId` nullable. Add `clientAttemptId TEXT` (nullable). Add `CHECK` constraint: exactly one of `fileId` / `clientAttemptId` is non-null. Update existing payment triggers to use `COALESCE(NEW.file_id, NEW.client_attempt_id)` as the `conversion_events.file_id` reference key.

**Conversions update:** Add `category TEXT DEFAULT 'document'`.

**Conversion events update:** Add `eventSource TEXT DEFAULT 'server'`.

**New triggers:** INSERT + UPDATE OF status on `client_conversion_attempts` → `conversion_events` with `eventSource = 'client'`.

**Tests:** New `tests/unit/client-conversion-attempts.test.ts` — basic insert, status transitions, trigger events. Update payment trigger tests to verify `COALESCE` behavior: a payment with only `clientAttemptId` writes the attempt ID (not null) into `conversion_events.file_id`. Verify CHECK constraint rejects rows where both or neither of `fileId`/`clientAttemptId` are set.

### Step A3 — Client-side converter registry + Canvas converter

**New files:**
- `app/lib/client-converters/types.ts` — `ClientConversionInput`, `ClientConversionOptions`, `ClientConversionResult`, `ClientConverter` interfaces
- `app/lib/client-converters/index.ts` — Registry: `Map<string, () => Promise<ClientConverter>>` (lazy factories), `registerClientConverter()`, `getClientConverter()`
- `app/lib/client-converters/canvas-converter.ts` — `createCanvasConverter({ targetMimeType, targetExtension, defaultQuality })` factory. Handles all 9 core image conversions in standard mode: Image → Canvas → `toBlob()`. Includes `isSupported()` checks (AVIF decode test, WebP encode test).
- `app/lib/client-converters/svg-png.ts` — SVG-specific: load as data URL via `<img>`, render to canvas. **External asset detection:** Before rendering, parse the SVG string for `<image href="http...">`, `url(http...)` in `<style>` blocks, and `<use href="http...">` elements. If found, warn the user that external references will not render (canvas `drawImage` with SVG data URLs silently drops them). Do not block the conversion — just surface a non-blocking warning.

**AVIF support fallback:** The `isSupported()` check for AVIF decode uses a small test image via `createImageBitmap`. When AVIF is not supported (older browsers), the conversion page shows an "unsupported browser" message with minimum version requirements — do not hide the page entirely (it still provides SEO value).

**Tests:** `tests/unit/client-converters/canvas-converter.test.ts`, `tests/unit/client-converters/index.test.ts` (mocked Canvas/Image/Blob).

### Step A4 — WebP enhanced quality converter (`@jsquash/webp` WASM)

**New file:** `app/lib/client-converters/webp-converter.ts`

**NPM dependency:** `@jsquash/webp` — the only production-ready, browser-native, encoding-capable WebP WASM option. One Vite config line for WASM asset handling (`optimizeDeps.exclude: ['@jsquash/webp']` or `assetsInclude: ['**/*.wasm']`). Lazy-loaded only when user selects Enhanced quality. Run in Web Worker where practical. On load failure: surface non-blocking error, allow retry or fallback to canvas Standard mode.

> **Migration path:** The `@jsquash/*` family also provides `@jsquash/avif` and `@jsquash/jpeg` for Phase 11 advanced codecs.

**Tests:** `tests/unit/client-converters/webp-converter.test.ts` — mocked WASM loading, fallback paths.

### Step A5 — Rate-limit transaction support + Client-side API endpoints (4 server functions)

> **Merged from former A5b:** Rate-limit `executor` parameter is added first in this step because the API endpoints depend on it for transactional atomicity.

**API pattern decision:** All 4 client-conversion endpoints use `createServerFn` (server functions), not file-based routes. They are called exclusively by client hooks via `callServerFn`, matching the existing patterns (`convert.ts`, `create-checkout.ts`, `conversion-status.ts`). `attemptId` is passed as request body data, not URL path params. This deliberately deviates from the spec's `GET /api/client-conversion/:attemptId/status` to stay consistent with the codebase's server function pattern — the status endpoint is a `GET` server function receiving `attemptId` via the data payload, not a RESTful path param route. An HTTP handler variant (`handleClientConversionStatusHttpRequest`) is also provided for the test harness.

Each endpoint follows the 3-layer pattern from `app/server/api/convert.ts`.

**Rate-limit changes (do first):**

**Modify:**
- `app/lib/db/index.ts` — Export `DbExecutor` type extracted from Drizzle's transaction callback
- `app/lib/rate-limit.ts` — Add optional `executor: DbExecutor = db` parameter to `reserveRateLimitSlot`, `consumeRateLimitSlot`, `releaseRateLimitSlot`, and internal `ensureRateLimitBucket`. Existing call sites unchanged (parameter omitted).

**Tests:** Update `tests/unit/rate-limit.test.ts` — add cases verifying reserve/consume/release work when passed a `tx` from `db.transaction()`, and that a transaction rollback undoes a reserved slot.

**New endpoint files:**
- `app/server/api/client-conversion-start.ts`
  - Validate `conversionSlug` against client-side conversions
  - Generate UUID attemptId + random UUID token
  - Store `SHA-256(token)` as `tokenHash` (no `recoveryToken` on free start)
  - Use `db.transaction(async (tx) => { ... })` so `reserveRateLimitSlot(ip, date, tx)` and attempt insert succeed or roll back together
  - If allowed: insert with `status: 'reserved'`, `expiresAt: now + 30min`; if not: insert with `status: 'payment_required'`
  - **Set HMAC recovery cookie:** `wf_attempt_{attemptId}` = `HMAC-SHA256(attemptId, SERVER_SECRET)`, `HttpOnly; Secure; SameSite=Lax`, session lifetime (no `Max-Age`)
  - Return `{ allowed, attemptId, token, remainingFreeAfterReservation }` or `{ allowed: false, attemptId, requiresPayment: true }`

- `app/server/api/client-conversion-status.ts`
  - Lookup by attemptId
  - If `pending_payment`: call `reconcileClientPendingPayment(attemptId)` (new function in stripe.ts)
  - **Ownership check (IP + cookie fallback):** return a recovery token only when (a) requesting IP matches `attempt.ipAddress`, OR (b) the `wf_attempt_{attemptId}` cookie contains a valid HMAC for this attemptId. Without either, return status without token.
  - If `status === 'ready'` and `recoveryToken` is present and ownership verified: return it exactly once and clear `recoveryToken` in the same transaction
  - `reserved` attempts never replay the original plaintext token from the DB; same-tab refresh relies on `sessionStorage`
  - Return status payload; token included only when a one-time `recoveryToken` is successfully claimed

- `app/server/api/client-conversion-complete.ts`
  - Verify token: `SHA-256(presentedToken) === row.tokenHash`
  - Check `expiresAt` not passed
  - Idempotent: `UPDATE ... SET status='completed' WHERE id=? AND status IN ('reserved','ready')` — if `rowsAffected === 0` and current status is `completed`, return success
  - If free: `consumeRateLimitSlot(ip, rateLimitDate, tx)` inside same transaction
  - Clear any leftover `recoveryToken` when leaving `ready`
  - Record analytics: outputFilename, outputMimeType, outputSizeBytes, durationMs

- `app/server/api/client-conversion-fail.ts`
  - Verify token
  - Idempotent: `UPDATE ... SET status='failed' WHERE id=? AND status IN ('reserved','ready')` — if already `failed`, return success
  - If free: `releaseRateLimitSlot(ip, rateLimitDate, tx)` inside same transaction
  - Clear any leftover `recoveryToken` when leaving `ready`
  - Record errorCode and errorMessage

**Modify:**
- `app/server/api/contracts.ts` — Add types: `ClientConversionStartResponse`, `ClientConversionStatusResponse`, `ClientConversionCompleteResponse`, `ClientConversionFailResponse`, `ClientAttemptStatus` type union. Add `CheckoutRequest = { fileId: string } | { attemptId: string }`.
- `app/server/api/create-checkout.ts` — Accept `{ fileId } | { attemptId }`. Dispatch to existing `createCheckoutSession(fileId)` or new `createClientCheckoutSession(attemptId)`.
- `app/lib/stripe.ts` — Add `createClientCheckoutSession(attemptId)`: looks up `client_conversion_attempts`, creates Stripe session with `{ attemptId }` in metadata. Checkout success URL: `/${conversionType}?attemptId=X&session_id=Y`. Add `reconcileClientPendingPayment(attemptId)`. Update `handleCheckoutCompleted` to check metadata for `attemptId` and, on payment success: mint a fresh token, replace `tokenHash`, store the plaintext in `recoveryToken`, set status to `ready`, **and extend `expiresAt` to a fresh 30-minute window** so the user has enough time to reselect their file and complete the conversion after returning from Stripe. The client retrieves that token exactly once via the `/status` endpoint (see recovery cookie below).
- `app/lib/request-rate-limit.ts` — Add rate-limit tier for client conversion endpoints (10 req/min for start/complete/fail, 20 req/min for status). **Moved from C3** — these endpoints are callable after Batch A deployment and must not ship without request throttling.
- `tests/helpers/create-test-app.ts` — Register 4 new endpoint routes.

**Tests:**
- `tests/unit/client-conversion-start.test.ts` — happy path, quota exhausted, invalid slug, token hash stored
- `tests/unit/client-conversion-complete.test.ts` — happy path, bad token, expired, idempotent re-complete, quota consumed exactly once
- `tests/unit/client-conversion-fail.test.ts` — happy path, idempotent re-fail, quota released exactly once
- `tests/integration/client-conversion-api.test.ts` — full start→complete, start→fail, payment flow via checkout, one-time recovery token behavior, IP mismatch on recovery, token validation, expiry behavior

### Step A6 — Client-side cleanup and crash recovery

**Modify:**
- `app/lib/cleanup.ts` — Add pass for stale `client_conversion_attempts`:
  - Expire `reserved` attempts where `expiresAt < now` → set `status = 'expired'`, release rate limit slot (reservation was held)
  - Expire `ready`, `payment_required`, and `pending_payment` attempts where `expiresAt < now` → set `status = 'expired'` (no slot to release)
  - Clear any lingering `recoveryToken` whenever an attempt is expired
- `app/lib/server-runtime.ts` — No separate client-attempt recovery query. `initializeServerRuntime()` already runs `cleanupExpiredFiles()` at startup, so expanding `cleanup.ts` gives startup recovery for expired client attempts automatically.

**Tests:** Update `tests/unit/cleanup.test.ts` — test expiry for each status (reserved with release; ready/payment_required/pending_payment without release) and `recoveryToken` clearing. Update `tests/unit/crash-recovery.test.ts` — verify startup `initializeServerRuntime()` cleanup expires stale client attempts.

---

## Batch B: Frontend Infrastructure

New hooks and components. Still no new entries in the conversion registry, so no public-facing changes.

> **Execution note:** Start only after Batch A passes type-check + full test suite. This is a separate execution session.

### Step B1 — useClientConversionFlow hook

**New file:** `app/hooks/useClientConversionFlow.ts`

**States:** `idle → reserving → converting → completed`, with `payment_required`, `pending_payment`, `failed`, `expired` branches.

**Flow:**
1. User selects file → call `startClientConversion` server fn → get `{ attemptId, token }`
2. If allowed → run client converter in browser → on success call `completeClientConversion` → done
3. If payment required → redirect to Stripe checkout → on return poll `client-conversion-status` → when `ready` → run converter
4. If converter fails → call `failClientConversion` → release slot

**Returns:** state, attemptId, error, result (Blob/text), progress, startConversion(file), reset(), downloadResult() (triggers browser download from Blob).

**Recovery:** Store the plaintext token in `sessionStorage` after `/start`. If `attemptId` is present in search params on mount (Stripe return), restore state by polling the status endpoint; when a one-time recovery token is returned, persist it to `sessionStorage` before continuing. If status is `ready` but no token is available, surface a restart action.

**File reselection after refresh/payment:** `sessionStorage` preserves the token but not the in-memory `File` object. After a hard refresh or Stripe return, the browser has no file to convert. When recovery succeeds (status is `ready` and token is obtained) but no `File` is in memory, show a clear prompt: "Payment confirmed! Please reselect your file to complete the conversion." The `FileUploader` is re-rendered in this state, and on file selection the conversion proceeds immediately using the recovered token. This keeps the UX honest — no file persistence, no IndexedDB complexity — and aligns with the privacy story (files are never stored).

### Step B2 — Client-side conversion components

**New files:**
- `app/components/conversion/ClientConversionPage.tsx` — Orchestrates client-side image flow using `useClientConversionFlow`. Renders FileUploader (reused), ConversionOptions, progress, ClientDownloadSection, PrivacyBadge. Shared shell: ConversionHero, SEOContent, FAQSection, RelatedConversions.
- `app/components/conversion/ServerConversionPage.tsx` — Extract existing flow from `$conversionType.tsx` into standalone component.
- `app/components/conversion/ConversionOptions.tsx` — Collapsible panel: processing mode toggle (Standard/Enhanced), quality slider, color profile checkbox. Only rendered on WebP pages.
- `app/components/conversion/ClientDownloadSection.tsx` — Download from Blob, "Convert another file" button, tab-close warning.
- `app/components/conversion/PrivacyBadge.tsx` — "Processed in your browser" (client) / "Processed on our secure servers" (server).

### Step B3 — Update `$conversionType` route for dual-mode

**Modify:**
- `app/routes/$conversionType.tsx` — Search schema adds optional `attemptId`. Component branches on `conversion.processingMode`:
  ```
  processingMode === "client" → <ClientConversionPage>
  processingMode === "server" → <ServerConversionPage> (extracted existing code)
  ```
  **Complete the `head` metadata** (currently missing from `$conversionType.tsx:48`): add self-referencing `<link rel="canonical">`, `og:url`, `twitter:card` (`summary`), `twitter:title`, `twitter:description`. These are required by the spec (`SPEC-reach-expansion.md:679`) and apply to both server and client pages.
- `app/lib/conversion-route-state.ts` — Add `deriveClientConversionRouteState({ attemptId, session_id, canceled })` parallel to existing function.
- `app/lib/structured-data.ts` — Add `buildBreadcrumbSchema(conversion)` and `buildSoftwareAppSchema(conversion)`. Breadcrumb trail: `Home > {Category} Converter > {Source} to {Target}` (e.g., `Home > Image Converter > WebP to PNG`). For server-side conversions without a hub page, use `Home > {Source} to {Target}`. `SoftwareApplication` schema is required by the spec (`SPEC-reach-expansion.md:677`) alongside `FAQPage` and `BreadcrumbList` — all three are emitted in the `head` function of `$conversionType.tsx`.

---

## Batch C: Go Live

Adds entries, updates all public surfaces. New entries start `indexable: false`.

> **Execution note:** Start only after Batch B passes type-check + full test suite. This is a separate execution session.

### Step C1 — Add 9 image conversion entries

**Modify:**
- `app/lib/conversions.ts` — Add 9 entries with `category: "image"`, `processingMode: "client"`, `clientConverter: "canvas"`, `indexable: false`, and no `toolName` because they are `ClientConversionType` entries. Full SEO content (drafted), 5-6 FAQs, 4-6 keywords, relatedConversions. 4 WebP entries also set `clientConverterEnhanced: "webp-wasm"`.
- `app/lib/conversion-summaries.ts` — Add 9 matching summaries with `category: "image"`.

### Step C2 — Update sitemap with indexable filter

**Modify:**
- `app/routes/api/sitemap[.]xml.tsx` — Change `getAllConversionTypes()` → `getIndexableConversions()`. Add hub page URLs (`/image-converter`, `/privacy`).

### Step C3 — Update metrics for client-side awareness

**Modify:**
- `app/routes/api/metrics.tsx` — Converter check: filter to `getServerConversions()` only. Add `clientConversions` section aggregating from `client_conversion_attempts`.

> **Note:** Request-rate-limit tiers for client endpoints were moved to A5 — they are already in place by this point.

### Step C4 — Image converter hub page

**New files:**
- `app/routes/image-converter.tsx` — Static route with SEO meta, FAQ, BreadcrumbList schema, QuickConvertSelector, grid of image conversions.
- `app/components/hub/HubPage.tsx` — Reusable hub template.
- `app/components/hub/QuickConvertSelector.tsx` — Source/target dropdowns → navigate to conversion page.
- `app/components/hub/CategoryConversionGrid.tsx` — Grid of conversion cards within a category.

### Step C5 — Homepage redesign

**Modify:**
- `app/routes/index.tsx` — Replace flat grid with categorized layout. Updated meta description.
- `app/components/home/HeroSection.tsx` — New copy: "Convert Files Without the Guesswork".

**New:**
- `app/components/home/CategorizedConversionGrid.tsx` — Groups by category with "See all" hub links.
- `app/components/home/CategorySection.tsx` — Top 4-6 tools per category.

### Step C6 — Header nav restructure

**Modify:**
- `app/components/layout/Header.tsx` — Replace flat dropdown with category-grouped navigation. Add hub page links.

### Step C7 — Privacy page

**New file:** `app/routes/privacy.tsx` — Client-side vs server-side processing explained, retention, payment handling, no-tracking.

### Step C8 — Flip indexable after QA

After browser QA (Chrome, Firefox, Safari, Edge) and human copy review, flip each entry's `indexable` to `true`. This is a code change — the conversion entries in `conversions.ts` are updated.

---

## Phases 10-13 (Future Sessions — Context Only)

### Phase 10: Developer/Data Tools
9 client-side conversions (JSON↔YAML, JSON↔CSV, XML↔JSON, XML→CSV, MD↔HTML). Paste input UI, preview/copy/download. `developer-tools` hub page. NPM deps: `js-yaml`, `papaparse`, `turndown`.

### Phase 11: Advanced Image + Ebook
6 advanced image (HEIC, TIFF, BMP, GIF, ICO via libheif/UTIF.js). 4 ebook (Calibre-based). `ebook-converter` hub page.

### Phase 12: Document/Office
6 server-side (PDF-to-text via Poppler, ODT/RTF/CSV/XLSX via LibreOffice, PDF-to-Markdown experimental). `document-converter` hub. Docker: add `poppler-utils`.

### Phase 13: SEO Hardening
8-12 blog posts, blog index clustering, internal linking refresh, trust blocks.

---

## Verification Plan

### After Batch A
1. `npm run type-check` — no TS errors
2. `npm test` — all existing + new tests pass
3. All 7 existing conversions unchanged (same slugs, same behavior)
4. New API endpoints return correct responses (tested via integration tests)
5. Post-payment `/status` returns a recovery token once, only to the originating IP
6. Cleanup cron handles client attempt expiry
7. Metrics converter check still shows "ok" (no client entries to confuse it yet)

### After Batch B
1. `npm run type-check` + `npm test` pass
2. `ServerConversionPage` extraction: existing 7 conversions still render and function identically
3. `ClientConversionPage` renders correctly when a client-mode conversion is loaded (tested via adding a temporary test entry)

### After Batch C
1. All tests pass
2. `npm run build` succeeds
3. Dev server: existing 7 server-side conversions unchanged
4. Dev server: 9 new image conversions work end-to-end (upload → convert → download)
5. WebP Enhanced quality: WASM loads on opt-in, fallback on failure
6. Sitemap: only `indexable: true` conversions appear (initially none of the new 9)
7. Metrics: converter check only checks server-side tools; `clientConversions` section present
8. Header: category-grouped nav renders correctly
9. Homepage: categorized grid with "See all" links
10. Hub page: `/image-converter` renders with quick convert + grid
11. Privacy page renders
12. `npm run lint` passes

### Indexable flip gate
Per-entry checklist before flipping `indexable: true`:
- [ ] Converter works in Chrome, Firefox, Safari, Edge
- [ ] Output quality verified on real sample files
- [ ] SEO copy human-reviewed (not just AI-drafted)
- [ ] FAQ answers are accurate and specific
- [ ] Structured data validates (Google Rich Results Test)

---

## Critical Files Summary

| File | Role |
|------|------|
| `app/lib/conversions.ts` | Core data model — required `category`/`processingMode` fields, 9 new entries |
| `app/lib/conversion-summaries.ts` | Summary data with `category` field |
| `app/lib/db/schema.ts` | New `clientConversionAttempts` table, payment/event column additions |
| `app/lib/db/index.ts` | `DbExecutor` type export for transactional rate-limit support |
| `app/server/api/convert.ts` | 3-layer pattern reference for new endpoints |
| `app/server/api/contracts.ts` | New request/response types for client conversion API |
| `app/server/api/create-checkout.ts` | Dual dispatch: `fileId` or `attemptId` |
| `app/lib/stripe.ts` | `createClientCheckoutSession`, `reconcileClientPendingPayment`, webhook dispatch |
| `app/lib/rate-limit.ts` | Add optional `executor` param to `reserveRateLimitSlot` / `consumeRateLimitSlot` / `releaseRateLimitSlot` |
| `app/hooks/useConversionFlow.ts` | Pattern reference for `useClientConversionFlow` |
| `app/routes/$conversionType.tsx` | Dual-mode branching, `attemptId` search param |
| `app/lib/conversion-route-state.ts` | Parallel `deriveClientConversionRouteState()` |
| `app/routes/api/sitemap[.]xml.tsx` | Indexable filter |
| `app/routes/api/metrics.tsx` | Server-only converter check, client metrics section |
| `app/components/layout/Header.tsx` | Category-grouped nav |
| `app/lib/cleanup.ts` | Client attempt expiry |
| `app/lib/server-runtime.ts` | Client attempt crash recovery |
| `tests/helpers/test-env.ts` | New table in test DB setup |
| `tests/helpers/create-test-app.ts` | 4 new endpoint registrations |
