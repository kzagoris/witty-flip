# Review of Phase 9 Implementation Plan (`peppy-swinging-robin.md`)

## Context

Reviewing the Phase 9 (Core Image Foundation) implementation plan against the reach expansion spec and the actual codebase to identify strengths, concerns, and gaps before execution begins.

---

## Overall Assessment

**The plan is strong.** The batched rollout (A/B/C) is the right strategy, the discriminated union for `ConversionType` is clean, the token/security design is well thought out, and the test coverage plan is comprehensive. The plan clearly reflects deep understanding of the existing codebase patterns.

That said, there are several issues worth addressing before execution.

---

## Issues Found

### 1. Step ordering: A5b must come before A5

Step A5 (API endpoints) uses `reserveRateLimitSlot(ip, date, tx)` and `consumeRateLimitSlot(ip, date, tx)` inside `db.transaction()` blocks. But Step A5b is where the `executor` parameter is actually added to those functions.

**Fix:** Merge A5b into A5 or reorder so A5b executes first.

### 2. API endpoint pattern needs clarification

The plan says endpoints follow the 3-layer pattern from `convert.ts`, creating files in `app/server/api/`. But there's an ambiguity: the existing `conversion-status.ts` uses `createServerFn` with data parameters, while the spec defines `GET /api/client-conversion/:attemptId/status` with a URL path parameter.

Server functions (`createServerFn`) don't natively support URL path parameters. Two options:
- **Server function approach:** Pass `attemptId` as a body/query param (e.g., `{ attemptId }`) — consistent with existing patterns, called via `callServerFn`
- **File-based route approach:** `app/routes/api/client-conversion/$attemptId/status.tsx` — cleaner URL but different calling pattern

**Recommendation:** Use server functions for all 4 endpoints (start, complete, fail, status) since they're exclusively called by client hooks via `callServerFn`. This matches the existing patterns (`convert.ts`, `create-checkout.ts`, `conversion-status.ts`). Pass `attemptId` as request body data.

### 3. "Backend" batch contains client-side code

Steps A3 (canvas converter) and A4 (WebP WASM converter) are browser-side code placed in "Batch A: Backend Infrastructure." This is not wrong from a risk perspective (no public-facing changes), but the naming is confusing.

**Suggestion:** Rename to "Batch A: Foundation Infrastructure" or split A3/A4 into their own batch.

### 4. `_testRegisterConversion` — replace with `vi.mock()` (decided)

The plan adds `_testRegisterConversion()` and `_testUnregisterConversion()` to `conversions.ts`. **Drop these entirely.** Use standard `vi.mock()` pattern instead — this is already the established pattern in the codebase (Stripe, spawn-helper, etc.). The test helper file (`tests/helpers/test-client-conversion.ts`) still makes sense but exports a mock setup function. See "Recommended Changes" section for the implementation.

### 5. Payments column: spec divergence is intentional but should be documented

The spec says to migrate `fileId` → `conversionId` in the payments table, but the plan keeps `fileId` and adds `clientAttemptId`. This is the right call (avoids a risky rename migration), but the plan should explicitly note this as a deliberate deviation from the spec.

### 6. Missing `DbExecutor` export location

The plan mentions exporting `DbExecutor` from `app/lib/db/index.ts` (in the code snippet under Decision 3) but doesn't list `app/lib/db/index.ts` as a modified file in any step.

### 7. Scope concern: session size

Batch A alone has 6 major steps, each with new files + tests. Batch B adds 5 new components + route refactoring. Batch C adds 9 conversion entries + 5 new pages. This is a very large scope for a single planning session's execution.

**Suggestion:** Consider treating each batch as a separate execution session. Batch A is self-contained and can be verified independently before starting Batch B.

---

## Smaller Observations

### Things the plan gets right

- **Discriminated union** (`ServerConversionType | ClientConversionType`) eliminates `toolName` undefined checks cleanly
- **Token hashing** (SHA-256 stored, plaintext never re-derived) is correct security practice
- **One-time recovery token** with IP gating is a solid recovery mechanism
- **Idempotency guards** on `/complete` and `/fail` prevent double-counting
- **Transaction wrapping** for reserve + insert atomicity prevents orphaned reservations
- **`indexable` gate** prevents premature SEO exposure
- **Cleanup handling** correctly differentiates `reserved` (release slot) vs `ready`/`payment_*` (no slot to release)

### Minor gaps

- **SVG external asset detection** (Step A3, `svg-png.ts`): The plan mentions "detect external asset references and warn" but doesn't specify the detection mechanism. Canvas `drawImage` from an `<img>` tag with an SVG data URL will silently fail on external references. The converter should parse the SVG string for `<image href="http...">`, `url()` in styles, and `<use href="http...">` before rendering.

- **AVIF browser support check** (Step A3): The plan mentions `isSupported()` checks for AVIF decode but doesn't specify the fallback behavior when AVIF is unsupported. Should the page show an unsupported-browser message or hide the conversion entirely?

- **WebP WASM package: decided** — Use `@jsquash/webp`. It's the only production-ready, browser-native, encoding-capable option. One Vite config line for WASM asset handling. Aligns with A4's requirements (lazy-load, Web Worker, fallback on failure). The `@jsquash/*` family also provides a migration path for Phase 11 codecs (AVIF via `@jsquash/avif`, JPEG via `@jsquash/jpeg`).

- **Step B3 `buildBreadcrumbSchema`**: Listed as a new function in `structured-data.ts`, but there's no specification for what the breadcrumb trail looks like (Home > Image Converter > WebP to PNG? Or just Home > WebP to PNG?).

---

## Recommended Changes Before Execution

1. **Merge A5b into A5** — the rate-limit change is small (one optional `executor` param on 3 functions) and exists solely to support the API endpoints. Keeping them separate creates a dependency ordering bug.
2. **Clarify API pattern:** server functions for all 4 client-conversion endpoints
3. **Rename Batch A** to "Foundation Infrastructure"
4. **WebP WASM package: `@jsquash/webp`** — update A4 to reference this explicitly (and note `@jsquash/*` migration path for Phase 11)
5. **Consider splitting execution** into one session per batch
6. **Add `app/lib/db/index.ts`** to merged A5's file list for `DbExecutor` export
7. **Drop `_testRegisterConversion` / `_testUnregisterConversion` entirely** — use standard `vi.mock()` pattern instead. The test helper (`tests/helpers/test-client-conversion.ts`) still makes sense but exports a mock setup function rather than calling production mutation APIs:
   ```typescript
   // tests/helpers/test-client-conversion.ts
   import { vi } from 'vitest'

   export const testClientConversion = {
     slug: 'test-client-png-to-jpg',
     category: 'image',
     processingMode: 'client',
     clientConverter: 'canvas',
     sourceExtensions: ['.png'],
     // ... minimal required fields
   } as const

   export function mockConversionsWithClientEntry() {
     const actual = vi.importActual('~/lib/conversions')
     vi.mock('~/lib/conversions', async () => {
       const real = await actual
       return {
         ...real,
         getConversionBySlug: (slug) =>
           slug === testClientConversion.slug
             ? testClientConversion
             : real.getConversionBySlug(slug),
         getClientConversions: () => [testClientConversion],
       }
     })
   }
   ```
   This keeps zero test code in production `conversions.ts`, stays consistent with existing `vi.hoisted()` + `vi.mock()` patterns (Stripe, spawn-helper, etc.), and avoids mutable shadow arrays.
