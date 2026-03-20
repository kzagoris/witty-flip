# Fix client conversion error handling, phantom UI, and layout drift

## Context

Four verified bugs in the client-side conversion flow. Two are P1 (can burn paid authorizations or block users with terminal errors instead of recoverable fallbacks), one is P2 (UI control with no backing implementation), and one is lower-priority layout drift from the spec.

---

## Bug 1 (P1): Bookkeeping failure discards successful conversion

**Problem:** In `app/hooks/useClientConversionFlow.ts`, the browser conversion succeeds (line 247-262, `nextResult` is set), but if the subsequent `completeClientConversion` server call (line 267-274) fails with a transient error, line 282 throws into the generic catch at line 294. The catch unconditionally calls `failClientConversion` (line 303), discards `nextResult`, and marks the attempt failed. On paid conversions, this burns the authorization.

**Fix:** Wrap the bookkeeping call (lines 267-283) in its own try/catch with one retry. On exhausted retries, still show `nextResult` to the user — the file is already converted in-browser. Never call `/fail` for a conversion that succeeded.

### Changes

**`app/hooks/useClientConversionFlow.ts`:**

1. Hoist `nextResult` declaration before the `try` block as `let nextResult: ClientConversionResult | undefined` so it's visible in the outer catch as a safety net.

2. Replace lines 267-293 (from `const completionResult = ...` through the success-path state updates) with:
   ```
   let bookkeepingOk = false
   try {
       const completionResult = await callServerFn(completeClientConversion, { ...payload })
       if (!completionResult.ok) {
           if (completionResult.error.status === "expired") {
               expireAttempt(currentAttemptId, completionResult.error.message)
               return
           }
           // Retry once
           const retryResult = await callServerFn(completeClientConversion, { ...payload })
           if (!retryResult.ok) {
               if (retryResult.error.status === "expired") {
                   expireAttempt(currentAttemptId, retryResult.error.message)
                   return
               }
           } else {
               bookkeepingOk = true
           }
       } else {
           bookkeepingOk = true
       }
   } catch {
       // Network/fetch failure — bookkeeping lost, conversion result still valid
   }

   clearStoredToken(currentAttemptId)
   fileRef.current = null
   setAttemptId(null)
   setStatus(null)
   setError(null)
   setResult(nextResult)
   setProgress(100)
   setProgressMessage(
       bookkeepingOk
           ? "Conversion complete. Ready to download."
           : "Conversion complete. Server recording could not be confirmed."
   )
   setState("completed")
   ```

3. In the outer catch (line 294), add a safety-net guard at the top:
   ```
   if (nextResult) {
       // Conversion succeeded but something threw after — still show result
       clearStoredToken(currentAttemptId)
       ... show nextResult, setState("completed") ...
       return
   }
   ```

4. Remove `preserveColorProfile` from the dependency array at line 330 (handled in Bug 3).

---

## Bug 2 (P1): Enhanced WebP fallback is not implemented

**Problem:** When the `@jsquash/webp` codec fails to load, `webp-converter.ts` throws `"Enhanced quality couldn't load. Retry or continue in Standard mode."` The spec (SPEC-reach-expansion.md:139, :870, :942) requires a **non-blocking** fallback — show message, let user retry or switch to Standard. Instead, the throw hits the generic catch which calls `/fail` and terminates the attempt.

**Fix:** Introduce `EnhancedCodecLoadError` in the converter. In the hook, catch it specifically and surface a recoverable UI state with "Retry" and "Continue in Standard" actions.

### Changes

**`app/lib/client-converters/webp-converter.ts`:**

1. Add a named error class near the top (after imports):
   ```ts
   export class EnhancedCodecLoadError extends Error {
       constructor(message: string, options?: ErrorOptions) {
           super(message, options)
           this.name = "EnhancedCodecLoadError"
       }
   }
   ```

2. In `loadWebpCodec()` (line 47) and `getCodec()` (line 156), replace `new Error(...)` with `new EnhancedCodecLoadError(...)`.

**`app/hooks/useClientConversionFlow.ts`:**

3. Import `EnhancedCodecLoadError` from `~/lib/client-converters/webp-converter`.

4. Add state: `const [enhancedLoadFailed, setEnhancedLoadFailed] = useState(false)`.

5. In the outer catch (line 294), add as the first check (before the `nextResult` safety net):
   ```ts
   if (nextError instanceof EnhancedCodecLoadError) {
       setProgress(0)
       setProgressMessage(nextError.message)
       setEnhancedLoadFailed(true)
       setState("idle")
       return
   }
   ```

6. Add `retryEnhanced` callback: clears `enhancedLoadFailed`, re-runs `runClientConversion` with the stored file/attemptId/token.

7. Add `switchToStandard` callback: clears `enhancedLoadFailed`, sets `processingMode("standard")`. Since `effectiveProcessingMode` won't update in the same tick, add an optional `modeOverride` parameter to `runClientConversion` (used instead of `effectiveProcessingMode` for converter selection at line 222-225). `switchToStandard` calls `runClientConversion` with `modeOverride: "standard"`.

8. Expose `enhancedLoadFailed`, `retryEnhanced`, `switchToStandard` from the hook return.

**`app/components/conversion/ClientConversionPage.tsx`:**

9. In `renderFlowSection()`, add before the idle/drop-zone case:
   ```tsx
   if (flow.enhancedLoadFailed) {
       return (
           <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-3">
               <p className="text-sm text-amber-900">
                   Enhanced quality couldn't load. You can retry or continue with Standard mode.
               </p>
               <div className="flex gap-3">
                   <Button variant="outline" size="sm" onClick={flow.retryEnhanced}>
                       Retry Enhanced
                   </Button>
                   <Button size="sm" onClick={flow.switchToStandard}>
                       Continue in Standard
                   </Button>
               </div>
           </div>
       )
   }
   ```

---

## Bug 3 (P2): "Preserve color profile" checkbox is UI-only

**Problem:** The checkbox is shown, defaults to `true`, and the value is passed into converter options — but neither `canvas-converter.ts` (`canvasToBlob` at line 141) nor `webp-converter.ts` (`buildWebpEncodeOptions` at line 299) actually use it. The spec says "Preserve color profile checkbox appears when supported by the active path." No path supports it.

**Fix:** Remove the checkbox and associated state. The `preserveColorProfile` field stays in the `ClientConversionOptions` type (reserved for future use).

### Changes

**`app/hooks/useClientConversionFlow.ts`:**
- Delete line 126 (`useState(true)` for `preserveColorProfile`).
- Remove `preserveColorProfile` from the converter options at line 256 (or pass `undefined`).
- Remove from the dependency array at line 330.
- Remove `preserveColorProfile` and `setPreserveColorProfile` from the return object (lines 593, 597).

**`app/components/conversion/ConversionOptions.tsx`:**
- Remove `preserveColorProfile` and `onPreserveColorProfileChange` from the props interface (lines 12-13) and destructuring (lines 24-25).
- Delete lines 114-128 (the checkbox `<label>` block).

**`app/components/conversion/ClientConversionPage.tsx`:**
- Remove `preserveColorProfile={flow.preserveColorProfile}` and `onPreserveColorProfileChange={flow.setPreserveColorProfile}` from `<ConversionOptions>` (lines 205-206).

**`app/lib/client-converters/types.ts`:**
- Add a doc comment to `preserveColorProfile` field: `/** Reserved — not yet implemented by any converter. */`

---

## Bug 4 (Low): Options panel expanded by default and above drop zone

**Problem:** `ConversionOptions.tsx` line 34 has `defaultValue="options"` (accordion starts open). `ClientConversionPage.tsx` renders options at line 199 before the drop zone at line 212. Spec says: collapsed by default, below the drop zone.

### Changes

**`app/components/conversion/ConversionOptions.tsx`:**
- Line 34: remove `defaultValue="options"` from the `<Accordion>` (it starts collapsed when no defaultValue is given).

**`app/components/conversion/ClientConversionPage.tsx`:**
- Move the `{showConversionOptions && <ConversionOptions ... />}` block (lines 199-210) to after `{renderFlowSection()}` (line 212). Result order: QuotaBadge → PrivacyBadge → renderFlowSection (drop zone) → ConversionOptions.

---

## Implementation order

1. **Bug 3** first — pure deletion, simplifies the ConversionOptions interface
2. **Bug 4** second — trivial prop removal + reorder, quick
3. **Bug 2** third — new error class + hook state + fallback UI
4. **Bug 1** last — refactors the catch block that Bug 2 also touches; doing it last means the final catch structure is clean

## Files touched

| File | Bugs |
|------|------|
| `app/hooks/useClientConversionFlow.ts` | 1, 2, 3 |
| `app/lib/client-converters/webp-converter.ts` | 2 |
| `app/lib/client-converters/types.ts` | 3 (doc comment only) |
| `app/components/conversion/ConversionOptions.tsx` | 3, 4 |
| `app/components/conversion/ClientConversionPage.tsx` | 2, 3, 4 |
| `tests/unit/client-converters/webp-converter.test.ts` | 2 |

## Verification

1. `npm run type-check` — no type errors after removing `preserveColorProfile` props
2. `npm run test` — all ~249 tests pass, webp-converter tests updated for `EnhancedCodecLoadError`
3. Manual: open a WebP conversion page → options panel collapsed, below drop zone
4. Manual: simulate Enhanced codec failure → fallback UI appears with Retry / Standard buttons
5. Manual: block `/api/client-conversion/complete` in devtools → conversion still shows download
