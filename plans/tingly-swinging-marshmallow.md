# Fix: Pending Payment Expiry Race Condition

## Context

Client conversion attempts have `expiresAt = creation_time + 30min`. Stripe checkout sessions last 30min from when checkout is *created* (which can be much later). Two code paths can flip `pending_payment` → `expired` while the Stripe checkout is still active:

1. **Opportunistic expiry** (`client-conversion-status.ts:261-270`): on every status poll
2. **Cleanup cron** (`cleanup.ts:131-162`): every 15 minutes

When the Stripe webhook then calls `handleClientCheckoutCompleted` (`stripe.ts:501`):
- `previousStatus = "expired"` → `shouldMoveToReady = false`
- Only `{ wasPaid: 1 }` is set — no `ready` status, no recovery token, no fresh `expiresAt`
- **Customer is charged but conversion is permanently stuck in `expired`**

**Server-side is NOT affected**: no opportunistic expiry in server status polling; cleanup only expires server `pending_payment` after 2 hours.

---

## Strategy Analysis

### Strategy A: Remove `pending_payment` from expiry paths

Remove `"pending_payment"` from `inArray` in `client-conversion-status.ts:269` and `cleanup.ts:136`.

| Aspect | Assessment |
|--------|-----------|
| Prevents race | Yes — `pending_payment` is never expired |
| Recovers existing broken rows | No |
| UX during race window | Excellent — user always sees `pending_payment` |
| Abandoned attempt cleanup | **Broken** — zombie `pending_payment` rows accumulate forever if user abandons and stops polling |
| Complexity | Minimal (2 strings removed) |
| New edge cases | Zombie rows with no cleanup path if Stripe API is down during reconciliation |

**Verdict:** Simple but creates a resource leak. Reconciliation only runs during status polling (requires active user), so abandoned attempts are never cleaned up.

---

### Strategy B: Extend `expiresAt` when creating checkout

In `createClientCheckoutSession`, extend `expiresAt` to `now + 30min` when entering `pending_payment`.

| Aspect | Assessment |
|--------|-----------|
| Prevents race | Yes — attempt expiry now matches Stripe session expiry |
| Recovers existing broken rows | No |
| UX during race window | Good — attempt stays alive through checkout |
| Abandoned attempt cleanup | Good — expires 30min after checkout creation, then normally cleaned |
| Complexity | Low (add `expiresAt` to 2 `.set()` calls in `stripe.ts`) |
| New edge cases | Negligible — attempt lives 30min longer, backed by a real Stripe session |

**Verdict:** Addresses root cause (expiry/checkout timing mismatch). Abandoned attempts are still cleaned up after the extended window.

---

### Strategy C: Handle `expired` in webhook handler (safety net)

Expand `shouldMoveToReady` at `stripe.ts:501` to include `"expired"`.

| Aspect | Assessment |
|--------|-----------|
| Prevents race | No — only recovers after the fact |
| Recovers existing broken rows | Partially — only if webhook re-fires |
| UX during race window | **Poor** — user sees "expired" while paying, until webhook arrives and resurrects |
| Abandoned attempt cleanup | Normal (unchanged) |
| Complexity | Low (1 condition expanded) |
| New edge cases | `expired → ready` resurrection breaks assumption that `expired` is terminal; may confuse metrics/logging |

**Verdict:** Essential as a safety net but insufficient alone — users see confusing "expired" state during payment.

---

### Strategy D: Combination of B + C (Recommended)

Extend expiry at checkout creation (prevention) **and** handle `expired` in webhook (safety net).

| Aspect | Assessment |
|--------|-----------|
| Prevents race | Yes (via B) |
| Recovers existing broken rows | Partially (via C, if webhook re-fires) |
| UX during race window | Excellent — B prevents it; C is silent fallback |
| Abandoned attempt cleanup | Good (via B's extended expiry) |
| Complexity | Low-moderate (changes in one file: `stripe.ts`) |
| New edge cases | Minimal — C's resurrection almost never fires since B prevents the race |

**Verdict:** Defense in depth. B eliminates the race in normal flow. C catches edge cases (clock skew, concurrent cleanup, DB transaction ordering).

---

### Strategy E: Check Stripe session expiry before expiring `pending_payment`

Query payments table for active checkout sessions before expiring.

| Aspect | Assessment |
|--------|-----------|
| Prevents race | Yes |
| Recovers existing broken rows | No |
| UX during race window | Good |
| Abandoned attempt cleanup | Best — semantically correct timing |
| Complexity | **High** — requires JOIN/subquery in cleanup cron + status polling, breaks clean separation |
| New edge cases | Performance (SQLite subquery), null `checkoutExpiresAt` handling |

**Verdict:** Most semantically correct but over-engineered for this problem. B achieves the same practical result with far less complexity.

---

## Comparison Matrix

| Criterion | A | B | C | D (B+C) | E |
|-----------|---|---|---|---------|---|
| Prevents race | Yes | Yes | No | **Yes** | Yes |
| Recovers broken rows | No | No | Partial | **Partial** | No |
| UX during payment | Excellent | Good | Poor | **Excellent** | Good |
| Abandoned cleanup | Broken | Good | Normal | **Good** | Best |
| Complexity | Minimal | Low | Low | **Low-mod** | High |
| New edge cases | Zombies | Negligible | Resurrection | **Minimal** | Perf/null |

---

## Recommendation: Strategy D (B + C)

### Implementation Plan

**File: `app/lib/stripe.ts`**

#### Change 1 — Extend `expiresAt` at checkout creation (Strategy B)

In `createClientCheckoutSession`, add `expiresAt: getClientAttemptExpiresAt()` to the `.set()` calls:

- **Reusable session path (line ~325):** Add `expiresAt` to the update
- **New session transaction (line ~381):** Add `expiresAt` to the update

This reuses the existing `getClientAttemptExpiresAt()` function from `app/lib/client-conversion-attempts.ts:46`.

#### Change 2 — Handle `expired` in webhook handler (Strategy C)

In `handleClientCheckoutCompleted`:

- **Line 501:** Expand `shouldMoveToReady` to include `"expired"`
- **Duplicate webhook path (lines 503-512):** The existing `shouldMoveToReady` check already gates the recovery — no additional change needed since the condition expansion covers it

#### Change 3 — Add log for expired recovery

When `previousStatus === 'expired'` and we recover, log it distinctly for monitoring.

### Tests

**File: `tests/unit/stripe.test.ts`**

1. **Test: `expiresAt` extended at checkout creation** — create attempt with near-expiry `expiresAt`, call `createClientCheckoutSession`, verify `expiresAt` refreshed to ~30min from now
2. **Test: webhook recovers from expired status** — create attempt in `expired` status with pending payment, call `handleCheckoutCompleted`, verify status moves to `ready` with recovery token and fresh `expiresAt`
3. **Test: duplicate webhook recovers expired attempt** — create expired attempt with already-completed payment, call `handleCheckoutCompleted`, verify `moveClientAttemptToReady` is triggered

### Verification

1. `npm run type-check` — no TS errors
2. `npm test` — all ~249 existing tests pass
3. New tests cover: expiry extension, expired webhook recovery, duplicate webhook recovery
