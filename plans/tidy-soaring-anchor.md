# Phase 3: API Routes Implementation Plan

## Context

Phases 1-2 are complete: conversion definitions, file validation, rate limiting, queueing, converter wrappers, and core Stripe helpers are already implemented. Phase 3 exposes that backend functionality to the UI and closes the main gaps in the upload -> convert -> pay -> download flow.

This phase also includes the thin payment-facing API surfaces (`create-checkout` and Stripe webhook) even though deeper Stripe work is described in Phase 4 of `plans/IMPLEMENTATION.md`. That keeps the end-to-end conversion pipeline usable once Phase 3 lands.

## Architecture Decision

After analyzing TanStack Start v1.120+ internals, two patterns are available:

- **`createServerFn`** - RPC-style functions callable from React components. Handler receives `{ data, context, method }`. Access raw request metadata via `getRequest()` / `getRequestIP()` from `@tanstack/react-start/server`. FormData is passed through as `data` directly.

- **File-based route handlers** (`server.handlers` on `createFileRoute`) - traditional HTTP handlers receiving `{ request, params, pathname, context, next }` and returning a `Response`. Use these for binary streaming and raw request body access.

**Split:**
- `createServerFn` - upload, convert, conversion-status, rate-limit-status, create-checkout
- `server.handlers` - download, webhook/stripe

**No custom server entry needed.** File-based route handlers already provide the raw `Request`/`Response` access needed for binary downloads and Stripe signature verification.

### Contract Notes Before Coding

- The UI can call `createServerFn` endpoints directly, but that is not the same thing as shipping stable public REST endpoints. If `spec/SPEC.md` must remain externally callable as written, add thin HTTP alias routes later or update the spec to treat these as app-internal RPC surfaces.
- `POST /api/convert` should accept `{ fileId }` only for v1. The target format is already implied by the stored `conversionType`. If multi-target conversions are planned later, revisit the API shape then.
- `POST /api/create-checkout` should allow both `payment_required` and `pending_payment` so users can retry and reuse an existing open session.
- Standardize the status payload now as `{ fileId, status, progress, downloadUrl?, expiresAt?, errorCode?, message? }` to stay aligned with the spec and future UI work.

### Launch Risk To Address Explicitly

The current free-tier model increments quota only after a successful free conversion. That matches the product rules, but it also means parallel free requests can oversubscribe the daily limit before any counter increments unless Phase 3 adds an explicit reservation mechanism.

Phase 3 should reserve a free slot atomically before queueing, persist the reservation date on the conversion row, consume that reservation on successful completion, and release it on failure or timeout.

---

## Implementation Order

### Step 1: `app/lib/request-ip.ts` (New File)

Pure function for testability plus a thin framework wrapper.

**Key APIs used:**
- `getRequestIP()` from `@tanstack/react-start/server` - direct peer IP only
- `getRequest().headers.get('x-forwarded-for')` - raw forwarded chain

**Logic:**
1. Get the direct peer IP via `getRequestIP()` without enabling automatic forwarded-header trust
2. Normalize obvious loopback equivalents such as IPv4-mapped loopback addresses
3. Check whether the direct peer matches configured trusted proxy CIDRs
4. If trusted, parse the leftmost `X-Forwarded-For` value, trim it, validate it with `net.isIP()`, and return it
5. If untrusted, missing, malformed, or empty, ignore forwarded headers and return the direct peer IP
6. Final fallback: `'127.0.0.1'`

**Exports:**
```typescript
export function resolveIpFromValues(
  peerIp: string | undefined,
  forwardedFor: string | null,
  trustedProxies?: string[],
): string

export function resolveClientIp(): string
```

**CIDR matching:** Implement with `net.isIP()` plus bitmask comparison. No new dependency needed.

**Config:** `TRUSTED_PROXY_CIDRS` env var (comma-separated). Default to loopback only (`127.0.0.1`, `::1`) and require explicit production configuration for Caddy/container addresses.

**Tests:** `tests/unit/request-ip.test.ts`
- trusted proxy uses leftmost forwarded value
- untrusted proxy ignores spoofed header
- malformed header falls back to peer IP
- multiple forwarded values are trimmed correctly
- IPv4-mapped IPv6 loopback is handled correctly

---

### Step 2: `app/server/api/upload.ts` (Replace Stub)

**Pattern:** `createServerFn({ method: 'POST' })`

The handler receives `{ data: FormData }` when the client sends FormData.

**Flow:**
1. Validate `data` is `FormData`
2. Extract `file` (`File`) and `conversionType` (`string`)
3. Enforce the server-side size limit using `MAX_FILE_SIZE`
4. Read the buffer via `Buffer.from(await file.arrayBuffer())`
5. Call `validateFile(buffer, file.name, conversionType)` for extension and magic-byte validation
6. Generate `crypto.randomUUID()` and build the stored filename `{uuid}{ext}`
7. Ensure `CONVERSIONS_DIR` exists and write the input file
8. Resolve the caller IP via `resolveClientIp()`
9. Insert the `conversions` row with status `'uploaded'`
10. If the DB insert fails after the file write succeeds, delete the just-written file before returning an error
11. Return `{ fileId, status: 'uploaded' }`

**DB fields populated:** `id`, `originalFilename`, `sourceFormat`, `targetFormat`, `conversionType`, `ipAddress`, `inputFilePath`, `inputFileSizeBytes`, `status`

**Error handling:**
- `400` for invalid/missing form data or unsupported conversion type
- `413` for files over 10MB
- `400` for failed file validation
- `500` for filesystem or DB failures

**Key imports:** `~/lib/file-validation`, `~/lib/conversions`, `~/lib/db`, `~/lib/db/schema`, `~/lib/queue`, `~/lib/request-ip`

**Note:** Client-side file-size checks still belong in the uploader UI, but this server route must enforce the limit independently.

---

### Step 3: `app/server/api/convert.ts` (Replace Stub)

**Pattern:** `createServerFn({ method: 'POST' })` with `.inputValidator()` for `{ fileId: string }`

**Flow:**
1. Validate `fileId` shape
2. Look up the conversion row by `fileId`
3. If not found, return `404`
4. If status is `'queued'`, `'converting'`, `'completed'`, `'expired'`, `'payment_required'`, or `'pending_payment'`, return the current state instead of hard-failing; this keeps the operation idempotent for refreshes and double-clicks
5. If status is not `'uploaded'` and not covered by the idempotent cases above, return `409`
6. Resolve the caller IP via the shared trusted-proxy helper
7. Reserve a free slot atomically for the resolved IP and persist the reservation date on the conversion row
8. If quota remains, enqueue the job and return `{ fileId, status: 'queued' }`
9. If quota is exhausted, update the row to `'payment_required'`, return `402`, and include the payment-required state plus rate-limit info
10. If queueing fails after the reservation succeeds, release the reserved slot before returning the error

**Key imports:** `~/lib/rate-limit`, `~/lib/queue`, `~/lib/request-ip`, `~/lib/db`, `~/lib/db/schema`

---

### Step 4: `app/server/api/conversion-status.ts` (Replace Stub)

**Pattern:** `createServerFn({ method: 'GET' })` with `.inputValidator()` for `{ fileId: string }`

**Flow:**
1. Look up the conversion row by `fileId`
2. If not found, return `404`
3. Start with `{ fileId, status, progress }` where `progress` is derived from the coarse Phase 3 state machine
4. If the row is completed and `expiresAt` is in the past, report `{ fileId, status: 'expired', progress: 100, expiresAt }`
5. If the row is completed and not expired, verify the output file still exists on disk before returning a `downloadUrl`
6. If the artifact exists, return `{ fileId, status: 'completed', progress: 100, downloadUrl, expiresAt }`
7. If the DB says completed but the artifact is missing, omit `downloadUrl` and return `errorCode: 'artifact_missing'` with a user-safe message
8. If the row is failed or timed out, include `errorCode` and `message`
9. If the row is pending payment, return a message such as `Processing payment...` so the UI can poll cleanly

**Response shape:** `{ fileId, status, progress, downloadUrl?, expiresAt?, errorCode?, message? }`

---

### Step 5: `app/server/api/rate-limit-status.ts` (New File)

**Pattern:** `createServerFn({ method: 'GET' })`

**Flow:**
1. Resolve the caller IP with the same trusted-proxy helper used by upload and convert
2. Call `checkRateLimit(ip)`
3. Return `{ remaining, limit, resetAt }`

This route must use the same IP resolution policy as enforcement so the UI cannot drift from backend behavior.

---

### Step 6: `app/server/api/create-checkout.ts` (Replace Stub)

**Pattern:** `createServerFn({ method: 'POST' })` with `.inputValidator()` for `{ fileId: string }`

**Flow:**
1. Look up the conversion row by `fileId`
2. If not found, return `404`
3. Allow only `'payment_required'` and `'pending_payment'`
4. Call `createCheckoutSession(fileId)` from `~/lib/stripe`
5. Reuse any existing open session when available
6. Return `{ checkoutUrl, sessionId, fileId }`
7. If the conversion is already queued, converting, completed, or expired, return `409` instead of opening a new payment session
8. Wrap Stripe/configuration failures and return a user-safe error message

**Why allow `pending_payment`:** Stripe checkout links can expire or users can abandon and retry. Reusing or recreating a session avoids dead-end states.

---

### Step 7: `app/routes/api/download/$fileId.tsx` (New File)

**Pattern:** `createFileRoute('/api/download/$fileId')` with `server.handlers.GET`

Handler receives `{ request, params }` and returns a `Response` directly.

**Flow:**
1. Validate UUID format from `params.fileId`
2. Look up the conversion row and require status `'completed'`
3. Check `expiresAt`; return `410` if expired
4. Look up conversion metadata for `targetExtension` and `targetMimeType`
5. Build the output path as `{CONVERSIONS_DIR}/{fileId}-output{targetExt}`
6. Verify the file exists on disk; if missing, return `404`
7. Build a sanitized download filename from `originalFilename` plus the target extension
8. Stream the file with `Readable.toWeb(fs.createReadStream(path))`
9. Return `Content-Type`, `Content-Disposition`, and `Content-Length` headers

**Filename handling:**
- strip path separators and control characters
- preserve a readable basename when possible
- send both `filename=` and RFC 5987 `filename*=` forms for better browser compatibility

**Behavior:**
- do not delete the file after download
- free and paid conversions share the same one-hour retention window

---

### Step 8: `app/routes/api/webhook/stripe.tsx` (New File)

**Pattern:** `createFileRoute('/api/webhook/stripe')` with `server.handlers.POST`

Handler receives `{ request }` and returns a `Response` directly.

**Flow:**
1. Read the `stripe-signature` header
2. Read the raw body via `await request.text()`
3. Call `verifyWebhookSignature(rawBody, signature)`
4. If the event type is `checkout.session.completed`, call `handleCheckoutCompleted(event.data.object)`
5. Ignore unrelated Stripe event types and still return success
6. Return `Response.json({ received: true })`

**Status handling:**
- invalid or missing signature -> `400`
- verified webhook but downstream processing failure -> `500` so Stripe retries
- duplicate delivery must be safe because `handleCheckoutCompleted()` is idempotent

---

### Step 9: Cleanup

- **Delete** `app/server/api/download.ts` (stub replaced by route handler)
- **Delete** `app/server/api/webhook/stripe.ts` (stub replaced by route handler)
- Update any implementation docs that still imply a custom server entry or a public REST contract that no longer matches the chosen TanStack Start pattern

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `app/lib/request-ip.ts` | **Create** | Trusted-proxy IP resolution |
| `app/server/api/upload.ts` | Replace stub | FormData upload + validation |
| `app/server/api/convert.ts` | Replace stub | Idempotent convert trigger + rate-limit check |
| `app/server/api/conversion-status.ts` | Replace stub | Status polling with artifact checks |
| `app/server/api/rate-limit-status.ts` | **Create** | Rate-limit status for UI |
| `app/server/api/create-checkout.ts` | Replace stub | Stripe checkout creation / reuse |
| `app/routes/api/download/$fileId.tsx` | **Create** | Binary file streaming |
| `app/routes/api/webhook/stripe.tsx` | **Create** | Stripe webhook handler |
| `app/server/api/download.ts` | **Delete** | Replaced by route handler |
| `app/server/api/webhook/stripe.ts` | **Delete** | Replaced by route handler |
| `tests/unit/request-ip.test.ts` | **Create** | IP resolution tests |

## Existing Modules to Reuse

| Module | File | Functions Used |
|--------|------|---------------|
| File validation | `app/lib/file-validation.ts` | `validateFile()`, `MAX_FILE_SIZE` |
| Conversions | `app/lib/conversions.ts` | `getConversionBySlug()` |
| Rate limiting | `app/lib/rate-limit.ts` | `checkRateLimit()` |
| Queue | `app/lib/queue.ts` | `enqueueJob()`, `CONVERSIONS_DIR` |
| Stripe | `app/lib/stripe.ts` | `createCheckoutSession()`, `verifyWebhookSignature()`, `handleCheckoutCompleted()` |
| Database | `app/lib/db/index.ts` | `db` |
| Schema | `app/lib/db/schema.ts` | `conversions`, `payments` |

## Response Conventions

**Non-2xx error shape:**

```typescript
{
  error: 'machine_readable_code',
  message: 'User-friendly explanation',
  fileId?: 'uuid',
  status?: 'payment_required' | 'pending_payment' | 'queued' | 'converting' | 'completed' | 'failed' | 'timeout' | 'expired',
  checkoutUrl?: 'https://...',
  remaining?: number,
  limit?: number,
  resetAt?: string,
}
```

**Status success shape:**

```typescript
{
  fileId: 'uuid',
  status: 'uploaded' | 'payment_required' | 'pending_payment' | 'queued' | 'converting' | 'completed' | 'failed' | 'timeout' | 'expired',
  downloadUrl?: '/api/download/{fileId}',
  expiresAt?: 'ISO-8601',
  errorCode?: 'artifact_missing' | 'conversion_failed' | 'conversion_timeout' | string,
  message?: 'User-friendly explanation',
}
```

Server functions should use `setResponseStatus(code)` plus a returned object. Route handlers should use `Response.json(body, { status: code })`.

---

## Verification

1. `npm run dev` - ensure the route tree regenerates and the new route handlers register cleanly
2. `npm run type-check` - no TypeScript errors
3. `npm test` - existing unit tests still pass and new request-IP tests pass
4. Add or run integration coverage for:
   - happy path: upload -> convert -> poll -> download
   - rate-limit exhaustion after two successful free conversions
   - duplicate `convert` calls returning current state instead of double-enqueueing
   - trusted vs untrusted `X-Forwarded-For`
   - expired download returning `410`
   - webhook idempotency and retry behavior
   - missing output artifact handling in status/download
5. Manual browser smoke test through the actual UI instead of calling unstable `/_server` function IDs directly
6. Stripe webhook smoke test with `stripe listen --forward-to localhost:3000/api/webhook/stripe`

## Deferred Follow-Ups To Track

- Decide whether to preserve stable public REST endpoints in addition to TanStack RPC calls
- Fix or explicitly accept the parallel free-tier oversubscription race before launch
- Add broader integration tests once the UI layer is wired up
