# Fix: Completion failure masking, hidden warning, and type-check error

## Context

Three bugs were identified in the client conversion flow:

1. **P1 — Hard `/complete` failures masked as success.** When `completeClientConversion` fails twice with a non-expiry error (429/403/409/500), the code falls through with `bookkeepingOk = false`, clears `token` + `attemptId` + `fileRef`, and transitions to `"completed"`. This makes recovery impossible and leaks free rate-limit slots until cleanup expires them (~30 min).

2. **P2 — Soft-success warning is invisible.** The hook sets `progressMessage` to "Server recording could not be confirmed" but `ClientDownloadSection` never receives or displays it — always shows a clean success card.

3. **P1 — WebP test breaks `npm run type-check`.** `EnhancedCodecLoadError` from a dynamic `await import()` is used in a type position (`error as EnhancedCodecLoadError`), triggering TS2749.

## Commit 1: Fix type-check error in webp-converter test

**File:** `tests/unit/client-converters/webp-converter.test.ts`

**Line 128** — replace `error as EnhancedCodecLoadError` with `error as InstanceType<typeof EnhancedCodecLoadError>`:

```typescript
// Before:
expect((error as EnhancedCodecLoadError).name).toBe('EnhancedCodecLoadError')

// After:
expect((error as InstanceType<typeof EnhancedCodecLoadError>).name).toBe('EnhancedCodecLoadError')
```

**Verify:** `npm run type-check` passes. `npm test -- tests/unit/client-converters/webp-converter.test.ts` passes.

## Commit 2: Preserve token/attemptId when bookkeeping fails

**File:** `app/hooks/useClientConversionFlow.ts`

### 2a. Add `bookkeepingFailed` state

Near the other `useState` declarations, add:

```typescript
const [bookkeepingFailed, setBookkeepingFailed] = useState(false)
```

### 2b. Split success path by `bookkeepingOk` (lines 312-324)

Replace the unconditional clear + transition block with:

```typescript
if (bookkeepingOk) {
    clearStoredToken(currentAttemptId)
    fileRef.current = null
    setAttemptId(null)
} else {
    setBookkeepingFailed(true)
}
setStatus(null)
setError(null)
setResult(nextResult)
setProgress(100)
setProgressMessage(
    bookkeepingOk
        ? "Conversion complete. Ready to download."
        : "Conversion complete. Server recording could not be confirmed.",
)
setState("completed")
```

When bookkeeping fails, `token` stays in sessionStorage, `attemptId` stays in React state, and `fileRef` stays populated — enabling potential future retry.

### 2c. Same fix in catch path (lines 334-346)

The `if (nextResult)` branch at line 334 has the same unconditional clear. Apply the same pattern:

```typescript
if (nextResult) {
    setBookkeepingFailed(true)
    setStatus(null)
    setError(null)
    setResult(nextResult)
    setProgress(100)
    setProgressMessage("Conversion complete. Server recording could not be confirmed.")
    setState("completed")
    return
}
```

Remove `clearStoredToken`, `fileRef.current = null`, and `setAttemptId(null)` from this branch.

### 2d. Reset `bookkeepingFailed` on transitions

- In `reset()` (line 190 area): add `setBookkeepingFailed(false)`
- At the start of `runClientConversion()` (line 221 area): add `setBookkeepingFailed(false)`

### 2e. Expose in return value (line 651)

Add `bookkeepingFailed` to the returned object.

### 2f. Add regression test

**File:** `tests/unit/client-conversion-complete.test.ts`

Add a test verifying that completing an attempt already in `"completed"` or `"expired"` status returns 409 `invalid_status` (this is the most likely real-world scenario for a client-side bookkeeping retry hitting a non-recoverable state):

```typescript
it('rejects completion when attempt is in a non-completable status', async () => {
    const token = 'client-complete-wrong-status-token'
    const { hashClientAttemptToken } = await import('~/lib/client-conversion-attempts')
    const { processClientConversionComplete } = await import('~/server/api/client-conversion-complete')

    await db.insert(schema.clientConversionAttempts).values({
        id: 'attempt-wrong-status',
        conversionType: 'png-to-jpg',
        category: 'image',
        ipAddress: '127.0.0.1',
        inputMode: 'file',
        tokenHash: hashClientAttemptToken(token),
        status: 'failed',
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    })

    const result = await processClientConversionComplete({
        attemptId: 'attempt-wrong-status',
        token,
        outputFilename: 'output.jpg',
        outputMimeType: 'image/jpeg',
    }, '127.0.0.1')

    expect(result.status).toBe(409)
    expect(result.body).toMatchObject({ error: 'invalid_status' })
})
```

**Verify:** `npm test -- tests/unit/client-conversion-complete.test.ts` passes.

## Commit 3: Surface bookkeeping warning in download UI

### 3a. Add `bookkeepingWarning` prop to `ClientDownloadSection`

**File:** `app/components/conversion/ClientDownloadSection.tsx`

Add optional prop to interface (line 7-11):

```typescript
interface ClientDownloadSectionProps {
  result: ClientConversionResult
  onDownload: () => void
  onReset: () => void
  bookkeepingWarning?: string
}
```

Update destructuring (line 29):

```typescript
export function ClientDownloadSection({ result, onDownload, onReset, bookkeepingWarning }: ClientDownloadSectionProps) {
```

Add amber notice between the download button (line 65) and existing `result.warnings` section (line 67):

```tsx
{bookkeepingWarning && (
  <div className="w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900">
    <div className="mb-1 flex items-center gap-2 font-medium">
      <AlertTriangle className="h-4 w-4" />
      Server sync notice
    </div>
    <p className="text-xs text-amber-800">
      {bookkeepingWarning}
    </p>
  </div>
)}
```

### 3b. Pass warning from page component

**File:** `app/components/conversion/ClientConversionPage.tsx`

Update the completed branch (lines 128-132):

```tsx
<ClientDownloadSection
  result={flow.result}
  onDownload={flow.downloadResult}
  onReset={flow.reset}
  bookkeepingWarning={flow.bookkeepingFailed ? flow.progressMessage : undefined}
/>
```

**Verify:** `npm run type-check` passes. Visually confirm with a simulated bookkeeping failure (e.g., temporarily force `bookkeepingOk = false`).

## Verification

1. `npm run type-check` — zero errors (Commit 1 + 3)
2. `npm test` — all ~249 tests pass, including new invalid_status test (Commit 2)
3. `npm run lint` — no regressions
4. Manual: trigger a client conversion, observe the download card. Force a bookkeeping failure to confirm the amber warning appears.

## Critical files

| File | Commits |
|------|---------|
| `tests/unit/client-converters/webp-converter.test.ts` | 1 |
| `app/hooks/useClientConversionFlow.ts` | 2 |
| `tests/unit/client-conversion-complete.test.ts` | 2 |
| `app/components/conversion/ClientDownloadSection.tsx` | 3 |
| `app/components/conversion/ClientConversionPage.tsx` | 3 |
