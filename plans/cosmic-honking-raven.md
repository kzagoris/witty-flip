# Phase 9: Testing & QA — Implementation Plan

## Context

WittyFlip has ~249 tests across 30 files covering Phases 1–8. Phase 9 fills the remaining gaps called out in `plans/IMPLEMENTATION.md` Section 9: missing integration coverage for paid flows and queue behavior, API-level security tests, fixture-based conversion quality coverage, and .NET unit tests for the alert-check tool.

This revision tightens the plan around the current codebase so the new tests match the real API lifecycle, avoid existing rate-limit traps, and keep the fixture/.NET work maintainable.

---

## Step 1: Add Missing Integration Tests

**File:** `tests/integration/api.test.ts` (extend existing)

The existing file already covers the free happy path, quota exhaustion, proxy handling, expired downloads, missing artifacts, request throttling, and health. Add 4 new tests plus shared Stripe mock setup.

### 1a. Stripe Mock Setup

Add a hoisted Stripe client mock at the top of `tests/integration/api.test.ts` using the same pattern as `tests/unit/stripe.test.ts`.

```typescript
const { mockStripeClient } = vi.hoisted(() => ({
  mockStripeClient: {
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
    webhooks: { constructEvent: vi.fn() },
  },
}))

vi.mock('stripe', () => ({ default: vi.fn(() => mockStripeClient) }))
```

Guidelines:
- Mock only `stripe`, not `~/lib/queue`.
- In `beforeEach`, clear hoisted mock state with `vi.clearAllMocks()` and explicit `mockReset()` calls on `create`, `retrieve`, and `constructEvent`.
- Webhook tests must send a raw string body, because `handleStripeWebhookRequest()` reads `request.text()` before verifying the signature.

### 1b. Paid Conversion Flow

**Test:** `'handles paid conversion: upload -> 402 -> checkout -> webhook -> download'`

1. Pre-seed `rate_limits` for `127.0.0.1` with `freeConversionCount: 2`.
2. Register a mock `pandoc` converter that writes deterministic output.
3. Upload a Markdown file.
4. `POST /api/convert` -> `402` with `error: 'payment_required'`.
5. Mock `stripe.checkout.sessions.create()` to return `{ id, url, expires_at }`.
6. `POST /api/create-checkout` -> `200` with `checkoutUrl` + `sessionId`.
7. Mock `stripe.webhooks.constructEvent()` to return a `checkout.session.completed` event whose session object includes:
   - matching `metadata.fileId`
   - `payment_status: 'paid'`
   - `amount_total: 49`
   - `currency: 'usd'`
   - `payment_intent`
8. `POST /api/webhook/stripe` with raw body + `stripe-signature` header -> `200`.
9. Poll status until `completed`.
10. Download the converted file -> `200`.
11. Assert DB state:
    - `conversion.wasPaid === 1`
    - `conversion.status === 'completed'`
    - one `payments` row with `status === 'completed'`
12. Assert the free-tier bucket did not change beyond the original exhausted count (`freeConversionCount` stays `2`, `reservedFreeSlots` stays `0`).
13. Assert `stripe.checkout.sessions.retrieve()` was not needed for the webhook-driven happy path.

Note: the current implementation enqueues directly from the webhook when the conversion is still `pending_payment`, so there is no second `POST /api/convert` after checkout.

### 1c. Webhook Idempotency (Integration Level)

**Test:** `'handles duplicate checkout.session.completed webhooks without re-enqueueing'`

1. Reuse the same setup as 1b.
2. Fire the first webhook and wait for `completed`.
3. Send the exact same raw webhook payload again -> still `200`.
4. Assert:
   - converter call count stays `1`
   - exactly one payment row exists for the session
   - conversion status remains `completed`
   - `conversion_events` contains exactly one `payment_status_changed` row with `paymentStatus === 'completed'`

### 1d. Duplicate Convert Retry

**Test:** `'returns current status without re-enqueueing when convert is retried after state changes'`

Use two explicit subcases in one test or split into two tests:

1. **Completed conversion**
   - upload + convert a file to `completed`
   - call `POST /api/convert` again
   - expect `200` with `status: 'completed'`
   - assert converter call count did not increase
2. **Payment-required conversion**
   - pre-exhaust quota for the same IP
   - upload a new file
   - first `POST /api/convert` -> `402 payment_required`
   - second `POST /api/convert` -> same `402 payment_required`
   - assert no extra queue activity and only one status-change event to `payment_required`

### 1e. Concurrent Queue Limit (Integration Level)

**Test:** `'limits concurrent conversions to 5 when submitting 6 jobs through the API'`

1. Register a converter that returns deferred Promises and records each start.
2. Upload + convert 6 files using 6 distinct `x-test-peer-ip` values so the test does not trip:
   - the 2-free-per-day quota
   - the 10 req/min per-IP request throttle
3. Wait until 5 converter invocations have started before asserting queue state.
4. Query DB and assert `5` rows are `converting` and `1` row is `queued`.
5. Resolve one deferred conversion and wait for the 6th job to start.
6. Assert the formerly queued job moves into `converting`.
7. Resolve the remaining deferred jobs and wait for all 6 jobs to reach terminal states so the test leaves no background work behind.

**Optional follow-up if time remains:** add an integration test proving `POST /api/create-checkout` reuses an existing open Stripe Checkout session.

---

## Step 2: Add Security Tests

**Files:**
- `tests/integration/security.test.ts` (new)
- `tests/unit/converters/weasyprint.test.ts` (extend existing)

Use the same `createTestSandbox()`, `setupTestDb()`, and `createTestApp()` pattern as `tests/integration/api.test.ts`.

### 2a. Path Traversal in Filenames

**Test:** `'uses UUID-based storage regardless of path traversal in uploaded filenames'`

Upload these filenames for `markdown-to-pdf`:
- `../../etc/passwd.md`
- `..\\..\\windows\\system32\\config.md`

Assert for each upload:
- response is `200`
- DB `inputFilePath` is UUID-based and contains no `..`, `/`, or `\\`
- resolved storage path stays under the sandbox `data/conversions/` directory
- `originalFilename` preserves the user-supplied name

### 2b. Mismatched Extension / Content at the API Layer

**Test:** `'rejects files with mismatched extension and content at the API level'`

Use deterministic cases that match current validation behavior:
- invalid UTF-8 bytes uploaded as `.md` for `markdown-to-pdf`
- random non-ZIP bytes uploaded as `.docx` for `docx-to-markdown`

Assert:
- `400` with `error: 'invalid_file'`
- user-safe message is present
- no file is written to disk
- no DB row is created

Note: do not use a DjVu header with a `.md` extension here; the current text-file validation path is UTF-8 based and a short ASCII-heavy binary can accidentally look valid.

### 2c. Oversized File Upload

**Test:** `'rejects files exceeding 10MB at the API level'`

- Upload `Buffer.alloc(10 * 1024 * 1024 + 1, 0x61)` as `.md` for `markdown-to-pdf`
- Assert `413` with `error: 'file_too_large'`
- Assert no file on disk and no DB row

### 2d. WeasyPrint Argument Hardening

**Test:** extend `tests/unit/converters/weasyprint.test.ts`

Keep this as a unit test instead of an integration test. Assert that `weasyprintConverter.convert()`:
- includes `'--base-url'` and `'/dev/null'`
- does not include any `--allow-*` or `--enable-*` flags
- preserves the existing runtime-prerequisite warning that wrapper flags are not full SSRF protection

---

## Step 3: Create Fixture Test Infrastructure

### 3a. Shared ZIP / Binary Builders

**File:** `tests/fixtures/zip-builders.ts` (new)

Extract reusable helpers currently duplicated across tests:
- `buildZip()`
- `buildMinimalOdt()`
- `buildMinimalEpub()`
- `buildTinyPbm()`

Update `tests/unit/file-validation.test.ts` and `tests/smoke/tooling-smoke.test.ts` to import the shared builders instead of keeping file-local copies.

### 3b. Shared Fixture Helpers

**File:** `tests/fixtures/helpers.ts` (new)

Provide:
- `isToolAvailable(toolName)` -> spawn `tool --version`, return boolean
- `createFixtureDir()` -> `mkdtemp` + `registerTempRoot()`
- `fixturePath(category, filename)` -> resolves into `tests/fixtures/samples/{category}/{filename}`
- `expectOutputExists(path)` -> stat + non-zero size
- `expectPdfOutput(path)` -> `%PDF` magic
- `expectMobiOutput(path)` -> `BOOKMOBI` magic
- `expectZipEntry(path, entryPrefix)` -> ZIP structure assertion for DOCX outputs
- `expectOutputContains(path, text)` -> text includes check

### 3c. Dedicated Fixture Vitest Config

**File:** `vitest.fixtures.config.ts` (new)

The default `vitest.config.ts` excludes `tests/fixtures/**`, so `npm run test:fixtures` must use a dedicated config that:
- includes `tests/fixtures/**/*.test.ts`
- reuses the Node environment + setup file
- disables fixture-directory exclusion
- keeps execution serial (`fileParallelism: false`) to avoid noisy multi-tool contention

Update `package.json`:
- `test:fixtures`: `vitest run --config vitest.fixtures.config.ts`

### 3d. Sample Fixture Documents

**Directory:** `tests/fixtures/samples/{format}/`

Use a mix of generated text fixtures and checked-in binary fixtures.

**Generate in script:**
- `markdown/`: `simple-text.md`, `headings-lists.md`, `tables.md`, `images.md`, `corrupted.md`
- `html/`: `simple-text.html`, `headings-lists.html`, `tables.html`, `images.html`, `corrupted.html`
- `latex/`: `simple-text.tex`, `headings-lists.tex`, `tables.tex`, `math-formulas.tex`, `corrupted.tex`
- `odt/`: `simple-text.odt`, `headings-lists.odt`, `tables.odt`, `images.odt`, `corrupted.odt`
- `epub/`: `simple-text.epub`, `headings-lists.epub`, `tables.epub`, `images.epub`, `corrupted.epub`

**Check in curated binaries:**
- `docx/`: a small set of real DOCX samples for text, headings/lists, tables, and images
- `djvu/simple-page.djvu`: generated once from `buildTinyPbm()` + `cjb2`
- `djvu/corrupted.djvu`: truncated valid DjVu header/body

Fixture guidance:
- keep ODT/EPUB `mimetype` as the first stored ZIP entry
- use corrupted Markdown invalid UTF-8 bytes, not just random ASCII
- do not require corrupted HTML/Markdown to hard-fail; those tools can be tolerant
- prefer deterministic corruption cases for ZIP containers, DjVu, and LaTeX

### 3e. Fixture Generation Script

**File:** `scripts/generate-fixtures.mjs` (new)

Responsibilities:
- generate all text fixtures (MD, HTML, TEX)
- generate ODT + EPUB fixtures programmatically using `tests/fixtures/zip-builders.ts`
- create corrupted variants (truncation + invalid bytes)
- print one-time DjVu generation instructions if `cjb2` is unavailable
- remain idempotent so it can be re-run safely

### 3f. Seven Fixture Test Files

Each file under `tests/fixtures/`:

| File | Tool | Output Checks |
|------|------|--------------|
| `docx-to-markdown.test.ts` | pandoc | markdown text contains expected headings/lists/tables markers |
| `markdown-to-pdf.test.ts` | pandoc + weasyprint | `%PDF` magic, non-zero size |
| `html-to-pdf.test.ts` | weasyprint | `%PDF` magic, non-zero size |
| `djvu-to-pdf.test.ts` | ddjvu | `%PDF` magic |
| `epub-to-mobi.test.ts` | ebook-convert | `BOOKMOBI` magic |
| `odt-to-docx.test.ts` | pandoc | valid ZIP with `word/` entries |
| `latex-to-pdf.test.ts` | pdflatex | `%PDF` magic |

Rules for each fixture suite:
- skip with `describe.skip` when the required tool is unavailable
- use a 60s timeout per test case
- call converters directly, not the API
- corrupted-file cases should assert graceful failure or graceful non-crash, depending on tool tolerance

---

## Step 4: Alert-Check .NET Tests

### 4a. Refactor `Program.cs`

**Files:**
- `tools/alert-check/AlertLogic.cs` (new)
- `tools/alert-check/Program.cs` (modify)

Extract the testable logic from `Program.cs` into `AlertLogic`:

```csharp
public static class AlertLogic
{
    public static List<string> EvaluateMetrics(JsonNode? json, DateTime nowUtc);
    public static List<string> FilterSuppressedAlerts(
        IEnumerable<string> alerts,
        Dictionary<string, DateTime> state,
        DateTime nowUtc);
    public static string FormatAlertBody(IEnumerable<string> alerts);
    public static string ExtractAlertKey(string alert);
    public static Dictionary<string, DateTime> LoadState(string path);
    public static void SaveState(string path, Dictionary<string, DateTime> state);
}
```

Implementation notes:
- pass `nowUtc` explicitly so `no_recent_success` tests are deterministic
- keep `Program.cs` responsible for I/O, SMTP, and HTTP calls
- keep `AlertLogic` responsible for threshold evaluation, dedup filtering, formatting, and state-file persistence helpers

### 4b. Test Project

**File:** `tools/alert-check-tests/alert-check-tests.csproj` (new)

Create an xUnit project targeting `net9.0` with references to:
- `Microsoft.NET.Test.Sdk`
- `xunit`
- `xunit.runner.visualstudio`
- `tools/alert-check/alert-check.csproj`

Note: `PublishAot` on the main project only affects `dotnet publish`, so the project reference remains usable for `dotnet test`.

### 4c. Test Files

**`ThresholdEvaluationTests.cs`**
- all metrics normal -> no alerts
- `disk.available == false` -> `metrics_partial`
- `usedPercent > 80` -> `disk_high`
- `queuedJobs > 20` -> `queue_backlog`
- `stalledJobs > 0` -> `queue_stalled`
- `successRate < 75 && total > 0` -> `error_rate_high`
- `successRate: 0, total: 0` -> no error-rate alert
- `artifactMissing > 0` -> `artifact_missing`
- `lastSuccessfulAt > 30 min ago` -> `no_recent_success`
- multiple thresholds breached -> multiple alerts
- malformed/mistyped metric values do not crash evaluation

**`DeduplicationTests.cs`**
- new alert not in state -> passes through
- alert inside 1hr window -> suppressed
- alert older than 1hr -> passes through
- mixed alert set -> correct filtering
- duplicate alert keys in the same batch are handled consistently
- `LoadState()` missing file -> empty dictionary
- `LoadState()` corrupted JSON -> empty dictionary
- `SaveState()` creates parent directory
- `SaveState()` round-trips correctly

**`AlertFormattingTests.cs`**
- single alert formatting
- multiple alerts joined with `\n`
- empty alerts -> empty string
- `ExtractAlertKey()` splits on first `:`
- `ExtractAlertKey()` handles strings without `:` and trims safely

---

## Batch Order

```text
Batch 1: Step 1 + Step 2
  - revise integration tests
  - add security coverage

Batch 2: Step 3a-3e
  - shared builders/helpers
  - fixture config
  - fixture generation

Batch 3: Step 3f
  - fixture conversion suites

Batch 4: Step 4
  - alert-check refactor
  - .NET test project
```

Batch 1 is the safest place to start because it exercises the current app behavior without requiring new runtime tooling.

---

## Key Files to Modify

| File | Action |
|------|--------|
| `plans/cosmic-honking-raven.md` | Revise implementation details and execution order |
| `tests/integration/api.test.ts` | Add Stripe mock setup + 4 integration tests |
| `tests/integration/security.test.ts` | **Create** API security tests |
| `tests/unit/converters/weasyprint.test.ts` | Extend hardening assertions |
| `tests/fixtures/zip-builders.ts` | **Create** shared ZIP/binary builders |
| `tests/fixtures/helpers.ts` | **Create** shared fixture utilities |
| `tests/fixtures/samples/**` | **Create** generated + curated fixture documents |
| `tests/fixtures/*.test.ts` | **Create** 7 fixture conversion suites |
| `scripts/generate-fixtures.mjs` | **Create** fixture generation script |
| `vitest.fixtures.config.ts` | **Create** dedicated fixture-test config |
| `package.json` | Update `test:fixtures` script |
| `tools/alert-check/AlertLogic.cs` | **Create** extracted testable logic |
| `tools/alert-check/Program.cs` | Refactor to call `AlertLogic.*` |
| `tools/alert-check-tests/alert-check-tests.csproj` | **Create** xUnit test project |
| `tools/alert-check-tests/*.cs` | **Create** threshold, dedup, formatting tests |

## Reusable Existing Code

- `createTestSandbox()`, `setupTestDb()` from `tests/helpers/test-env.ts`
- `createTestApp()` from `tests/helpers/create-test-app.ts`
- `registerTempRoot()` from `tests/setup.ts`
- Stripe hoisted mock pattern from `tests/unit/stripe.test.ts`
- existing converter unit-test structure from `tests/unit/converters/*.test.ts`
- existing fixture-builder logic currently duplicated in `tests/unit/file-validation.test.ts` and `tests/smoke/tooling-smoke.test.ts`

## Verification

1. `npm test` — integration, security, and unit tests all pass with no regressions.
2. `npm run test:fixtures` — fixture suite runs through `vitest.fixtures.config.ts`; locally it may skip when tools are missing.
3. `dotnet test tools/alert-check-tests/alert-check-tests.csproj` — alert logic tests pass.
4. Stripe mocking in `tests/integration/api.test.ts` does not break unrelated integration tests.
5. Target test count after Phase 9: ~270+ tests across 40+ files.
