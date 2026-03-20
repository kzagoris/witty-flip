# Migrate Payments from Stripe to SumUp

## Context

Stripe's fee structure (2.9% + 30¢ per transaction) is punishing for WittyFlip's $0.49 micro-payments — the 30¢ fixed fee alone eats ~61% of revenue per transaction. SumUp charges 2.5% with **no fixed fee**, reducing the per-transaction cost from ~$0.31 to ~$0.01. This migration is purely cost-driven. The app currently uses USD only; EUR support may be needed eventually.

SumUp's Hosted Checkout API is in beta (v0.1) — accepted risk. We'll use the official `@sumup/sdk` npm package. DB columns will use provider-agnostic names (`checkoutId`, `transactionId`). Webhook security via URL secret token + API verification.

---

## SumUp Developer Setup (Prerequisite)

1. Create a SumUp merchant account at https://me.sumup.com/
2. Go to **Settings → For Developers → Toolkit → API Keys**
3. Create an API key (prefixed `sup_sk_`) — this becomes `SUMUP_API_KEY`
4. Note your **Merchant Code** from dashboard → `SUMUP_MERCHANT_CODE`
5. SumUp provides a test environment — use test API keys during development
6. Configure a webhook endpoint in the SumUp dashboard pointing to your app's `/api/webhook/sumup/{SUMUP_WEBHOOK_SECRET}` URL

---

## Files to Modify (27 files)

### Core (5 files)
| File | Change |
|------|--------|
| `app/lib/stripe.ts` → **`app/lib/sumup.ts`** | Full rewrite: replace Stripe SDK with `@sumup/sdk`, same exported function signatures |
| `app/lib/db/schema.ts` | Rename `stripeSessionId` → `checkoutId`, `stripePaymentIntent` → `transactionId` |
| `app/lib/env.ts` | Replace `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` with `SUMUP_API_KEY`/`SUMUP_MERCHANT_CODE`/`SUMUP_WEBHOOK_SECRET` |
| `app/lib/client-conversion-attempts.ts` | Update error message referencing `STRIPE_SECRET_KEY` → `SUMUP_API_KEY` |
| `package.json` | Remove `stripe`, add `@sumup/sdk` |

### API Routes (4 files)
| File | Change |
|------|--------|
| `app/routes/api/webhook/stripe.tsx` → **`app/routes/api/webhook/sumup/$secret.tsx`** | Rename + rewrite: URL secret param, verify via API, no HMAC |
| `app/server/api/create-checkout.ts` | Change import `~/lib/stripe` → `~/lib/sumup` |
| `app/server/api/conversion-status.ts` | Change import `~/lib/stripe` → `~/lib/sumup` |
| `app/server/api/client-conversion-status.ts` | Change import `~/lib/stripe` → `~/lib/sumup` |

### UI (0 changes needed)
- `PaymentPrompt.tsx` — already provider-agnostic (just redirects to `checkoutUrl`)
- `useConversionFlow.ts` / `useClientConversionFlow.ts` — no Stripe-specific code

### Config & Infra (4 files)
| File | Change |
|------|--------|
| `.env.example` | Replace Stripe env vars with SumUp vars |
| `docker-compose.yml` | Replace env var pass-through |
| `Caddyfile` | Remove `js.stripe.com`/`api.stripe.com` from CSP (SumUp uses redirect, no iframe/JS embed) |
| `CLAUDE.md` | Update all Stripe references |

### Tests (9 files)
| File | Change |
|------|--------|
| `tests/unit/stripe.test.ts` → **`tests/unit/sumup.test.ts`** | Full rewrite: mock `@sumup/sdk`, update all column refs |
| `tests/integration/api.test.ts` | Update mocks, env vars, webhook URL |
| `tests/integration/client-conversion-api.test.ts` | Same pattern |
| `tests/integration/security.test.ts` | Update env var names |
| `tests/unit/env.test.ts` | Update expected env var names |
| `tests/unit/conversion-status.test.ts` | Change mock `~/lib/stripe` → `~/lib/sumup` |
| `tests/unit/client-conversion-status.test.ts` | Same |
| `tests/unit/conversion-events.test.ts` | Update `stripeSessionId` → `checkoutId` in test data |
| `tests/helpers/test-env.ts` | Update raw SQL: `checkout_id`, `transaction_id` columns |
| `tests/helpers/create-test-app.ts` | Update webhook route import/path |

---

## Implementation Steps

### Step 1: Database Schema Migration

**File:** `app/lib/db/schema.ts`

Rename columns in `payments` table:
- `stripeSessionId` (column `stripe_session_id`) → `checkoutId` (column `checkout_id`)
- `stripePaymentIntent` (column `stripe_payment_intent`) → `transactionId` (column `transaction_id`)

Then run `npm run db:generate` to produce the Drizzle migration. Since SQLite has limited ALTER TABLE support, Drizzle will likely generate a table-recreation migration. Verify the generated SQL preserves data and recreates indexes/triggers.

Also update `tests/helpers/test-env.ts` raw SQL to match.

**Commit:** `Rename Stripe-specific payment columns to provider-agnostic names`

---

### Step 2: Replace Stripe with SumUp Core Module

**Delete** `app/lib/stripe.ts`, **create** `app/lib/sumup.ts`.

Install: `npm install @sumup/sdk && npm uninstall stripe`

**Exported functions (same signatures as current Stripe module):**

```
createCheckoutSession(fileId: string): Promise<{ checkoutUrl: string; sessionId: string }>
createClientCheckoutSession(attemptId: string): Promise<{ checkoutUrl: string; sessionId: string }>
handleCheckoutCompleted(checkoutId: string): Promise<void>
reconcilePendingPayment(fileId: string): Promise<void>
reconcileClientPendingPayment(attemptId: string): Promise<void>
verifySumUpCheckout(checkoutId: string): Promise<SumUpCheckout>
```

No more `verifyWebhookSignature` — replaced by `verifySumUpCheckout` (GET API call).

**Key differences from Stripe implementation:**

| Aspect | Stripe | SumUp |
|--------|--------|-------|
| Amounts | Cents (integer `49`) | Decimal (`0.49`) — convert at API boundary |
| Checkout creation | `POST /v1/checkout/sessions` | `POST /v0.1/checkouts` via SDK |
| Status check | `stripe.checkout.sessions.retrieve()` | `GET /v0.1/checkouts/{id}` via SDK |
| Metadata | `session.metadata.fileId` | Derive from DB `payments` row by `checkoutId` — no external metadata |
| Checkout expiry | Stripe provides `expires_at` | Compute locally: `Date.now() + 30min` |
| Statuses | `paid`/`expired`/`open` | `PAID`/`EXPIRED`/`FAILED`/`PENDING` |
| Idempotency | `idempotency_key` header | `checkout_reference` field (e.g., `wf-{fileId}-{timestamp}`) |

**Reconciliation is MORE important** with SumUp since they recommend always verifying via API after webhooks. The existing reconciliation-during-polling pattern becomes the primary payment verification mechanism.

**Commit:** `Replace Stripe payment module with SumUp integration`

---

### Step 3: Webhook Route

**Delete** `app/routes/api/webhook/stripe.tsx`.
**Create** `app/routes/api/webhook/sumup/$secret.tsx`.

Route: `POST /api/webhook/sumup/{secret}`

Security layers:
1. Validate `$secret` param matches `SUMUP_WEBHOOK_SECRET` env var (reject with 404 if mismatch)
2. Extract `checkout_id` from request body
3. Verify checkout exists in local `payments` table (prevents arbitrary API calls)
4. Call `verifySumUpCheckout(checkoutId)` to confirm payment status via SumUp API
5. If `PAID`, call `handleCheckoutCompleted(checkoutId)`
6. Return `{ received: true }` (200)

Run `npm run dev` briefly to regenerate `app/routeTree.gen.ts`.

**Commit:** `Add SumUp webhook route with URL secret and API verification`

---

### Step 4: Environment & Config

**`app/lib/env.ts`:** Replace required vars:
- `STRIPE_SECRET_KEY` → `SUMUP_API_KEY`
- `STRIPE_WEBHOOK_SECRET` → `SUMUP_WEBHOOK_SECRET`
- Add `SUMUP_MERCHANT_CODE` (required)

**`.env.example`:** Update template with SumUp vars.

**`docker-compose.yml`:** Update env var pass-through.

**`Caddyfile`:** Remove `js.stripe.com`, `api.stripe.com` from CSP headers. SumUp Hosted Checkout is a full redirect (no iframe/JS embed needed).

**Commit:** `Update environment config and CSP for SumUp`

---

### Step 5: Update API Route Imports

Update imports in 4 files from `~/lib/stripe` to `~/lib/sumup`:
- `app/server/api/create-checkout.ts`
- `app/server/api/conversion-status.ts`
- `app/server/api/client-conversion-status.ts`
- `app/lib/client-conversion-attempts.ts` (error message text)

No logic changes needed — function signatures are preserved.

**Commit:** `Update API routes to import from sumup module`

---

### Step 6: Test Suite Updates

**Rename** `tests/unit/stripe.test.ts` → `tests/unit/sumup.test.ts`

Major changes across all test files:
- Replace `vi.mock('stripe', ...)` with `vi.mock('@sumup/sdk', ...)`
- Replace all `stripeSessionId` → `checkoutId`, `stripePaymentIntent` → `transactionId`
- Replace `vi.mock('~/lib/stripe', ...)` → `vi.mock('~/lib/sumup', ...)`
- Update env var names: `SUMUP_API_KEY`, `SUMUP_MERCHANT_CODE`, `SUMUP_WEBHOOK_SECRET`
- Update webhook test URLs: `/api/webhook/sumup/{secret}`
- Remove `stripe-signature` header from webhook tests
- Update mock helpers: `makeStripeSession()` → `makeSumUpCheckout()` with SumUp response shape
- Update `tests/helpers/test-env.ts` raw SQL column names
- Update `tests/helpers/create-test-app.ts` webhook route

**Commit:** `Update test suite for SumUp payment provider`

---

### Step 7: Documentation

Update `CLAUDE.md` — replace all Stripe references with SumUp equivalents.
Update `spec/SPEC.md` and `spec/Architecture.md` if they reference Stripe.

**Commit:** `Update documentation for SumUp migration`

---

## Verification

1. **Unit tests:** `npm run test` — all ~249 tests pass
2. **Type check:** `npm run type-check` — no TypeScript errors
3. **Lint:** `npm run lint` — clean
4. **DB migration:** `npm run db:migrate` — columns renamed successfully
5. **Manual smoke test (with SumUp sandbox):**
   - Upload a file, exhaust free quota
   - Click "Pay & Convert" → redirected to SumUp Hosted Checkout
   - Complete test payment → redirected back
   - Verify conversion processes after payment
   - Check webhook endpoint receives notification
   - Verify reconciliation works (kill webhook, rely on status polling)
6. **Webhook security:** Hit `/api/webhook/sumup/wrong-secret` → 404
