# Fix: Client Conversion Status — Expiry Persistence & Cookie Parsing

## Context

Two bugs in `app/server/api/client-conversion-status.ts`:

1. **Expiry not persisted**: When the status endpoint detects a client attempt has expired (via `isClientAttemptExpired`), it only synthesizes `"expired"` in the API response (line 165) but never updates the DB row or releases the reserved free slot. The slot stays consumed until the 15-minute cleanup cron runs, potentially forcing a user into `payment_required` unnecessarily.

2. **Cookie parsing crash**: `parseCookieHeader` (line 128) calls `decodeURIComponent` on every cookie value without error handling. A single malformed percent-escape (e.g., `%ZZ`) from any cookie on the domain crashes the endpoint with a `URIError`, returning 500.

## Fix 1: Opportunistic Expiry Persistence

**File:** `app/server/api/client-conversion-status.ts`

In `processClientConversionStatus`, after fetching the attempt and before building the response, check `isClientAttemptExpired(attempt.expiresAt)`. If expired and the DB row isn't already `expired`, run an opportunistic transaction that:

1. Updates the row status to `expired` and clears `recoveryToken`
2. Releases the rate-limit slot if `status === 'reserved' && wasPaid === 0 && rateLimitDate` (matching cleanup logic in `cleanup.ts:152-154`)

Key considerations:
- **Idempotency**: Use a WHERE clause that checks current status is still in `['reserved', 'ready', 'payment_required', 'pending_payment']` to avoid double-processing if cleanup runs concurrently
- **Non-blocking**: Wrap in try/catch — if the opportunistic update fails, we still return the expired status response (the cleanup cron is the safety net)
- **Import `releaseRateLimitSlot`**: Add to the lazy-loaded deps interface and initialization
- **Import `inArray`**: Already available via drizzle-orm deps (add to interface)

Insert the expiry persistence block after line 243 (post-reconciliation re-read), before the cookie/ownership checks:

```typescript
if (attempt.status !== 'expired' && isClientAttemptExpired(attempt.expiresAt)) {
    try {
        await db.transaction(async (tx) => {
            const result = await tx
                .update(clientConversionAttempts)
                .set({ status: 'expired', recoveryToken: null })
                .where(and(
                    eq(clientConversionAttempts.id, attempt.id),
                    inArray(clientConversionAttempts.status, ['reserved', 'ready', 'payment_required', 'pending_payment']),
                ))

            if (result.rowsAffected > 0
                && attempt.status === 'reserved'
                && attempt.wasPaid === 0
                && attempt.rateLimitDate) {
                await releaseRateLimitSlot(attempt.ipAddress, attempt.rateLimitDate, tx)
            }
        })
    } catch (err) {
        requestLogger.warn({ attemptId: attempt.id, err }, 'Failed opportunistic expiry persistence')
    }
}
```

### Deps changes

Add to `ClientConversionStatusServerDeps` interface:
- `releaseRateLimitSlot` from `~/lib/rate-limit`
- `inArray` from `drizzle-orm`

Add corresponding imports in `getClientConversionStatusServerDeps`.

## Fix 2: Safe Cookie Decoding

**File:** `app/server/api/client-conversion-status.ts`

Wrap `decodeURIComponent` in `parseCookieHeader` (line 128) with try/catch:

```typescript
let decoded: string
try {
    decoded = decodeURIComponent(rawValue.join("=").trim())
} catch {
    decoded = rawValue.join("=").trim()
}
cookies.set(name, decoded)
```

On `URIError`, fall back to the raw (undecoded) value. This is safe because the recovery cookie values are hex HMAC digests — they never contain percent-encoded characters, so the fallback path won't affect their validation.

## Tests

**File:** `tests/unit/client-conversion-status.test.ts`

### Test for Fix 1: Expiry persistence
- Create an attempt with status `reserved`, `wasPaid: 0`, `rateLimitDate` set, and `expiresAt` in the past
- Call `processClientConversionStatus`
- Assert: response status is `expired`
- Assert: DB row status is now `expired`
- Assert: `reservedFreeSlots` for that IP/date was decremented (slot released)

### Test for Fix 2: Malformed cookie resilience
- Create an attempt in `ready` status with a recovery token
- Call `processClientConversionStatus` with a cookie header containing a malformed value (e.g., `bad_cookie=%ZZ; wf_attempt_{id}={valid_hmac}`)
- Assert: no 500 error — returns 200 with correct status
- Assert: recovery token handling still works (the valid recovery cookie is parsed correctly despite the bad cookie)

## Files to Modify

| File | Change |
|------|--------|
| `app/server/api/client-conversion-status.ts` | Add expiry persistence block, safe cookie decoding, new deps |
| `tests/unit/client-conversion-status.test.ts` | Add 2 test cases |

## Verification

1. `npm run type-check` — no TS errors
2. `npm test -- tests/unit/client-conversion-status.test.ts` — all tests pass including new ones
3. `npm test` — full suite passes, no regressions
