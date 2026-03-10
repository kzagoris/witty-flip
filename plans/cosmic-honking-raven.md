# Phase 9: Testing & QA — Implementation Plan

## Context

WittyFlip has ~249 tests across 30 files covering Phases 1–8. Phase 9 fills four remaining gaps identified in `plans/IMPLEMENTATION.md` Section 9: missing integration tests (paid flow, webhook idempotency), security tests, fixture-based conversion quality tests, and .NET unit tests for the alert-check tool.

---

## Step 1: Add Missing Integration Tests

**File:** `tests/integration/api.test.ts` (extend existing)

The existing file covers happy path, rate limiting, proxy handling, expired download, missing artifact, and request throttling. Add 4 new tests.

### 1a. Stripe Mock Setup

Add at top of `api.test.ts` (same pattern as `tests/unit/stripe.test.ts:10-27`):

```typescript
const { mockStripeClient, mockEnqueueJob: _ } = vi.hoisted(() => {
  const mockStripeClient = {
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
    webhooks: { constructEvent: vi.fn() },
  }
  return { mockStripeClient, mockEnqueueJob: vi.fn() }
})
vi.mock('stripe', () => ({ default: vi.fn(() => mockStripeClient) }))
```

**Note:** Only mock `stripe`, NOT `~/lib/queue` — we want the real queue for integration tests. The mock `stripe` client allows `createCheckoutSession()` and `verifyWebhookSignature()` to work without a real Stripe connection.

Add `mockStripeClient` reset in the existing `beforeEach`.

### 1b. Paid Conversion Flow

**Test:** `'handles paid conversion: upload -> 402 -> checkout -> webhook -> convert -> download'`

1. Pre-seed `rateLimits` with `freeConversionCount: 2` (exhausted)
2. Register a mock pandoc converter
3. Upload markdown file → 200
4. `POST /api/convert` → 402 `payment_required`
5. Mock `stripe.checkout.sessions.create` to return `{ id: 'cs_test_xxx', url: 'https://checkout.stripe.com/...' }`
6. `POST /api/create-checkout` → 200 with `checkoutUrl`
7. Mock `stripe.webhooks.constructEvent` to return a `checkout.session.completed` event with matching `fileId` metadata
8. Mock `stripe.checkout.sessions.retrieve` to return session with `payment_status: 'paid'`, `amount_total: 49`, `currency: 'usd'`
9. `POST /api/webhook/stripe` with raw body + `stripe-signature` header → 200
10. `waitForTerminalStatus` → `completed`
11. Download → 200 with converter output
12. Assert DB: `conversion.wasPaid === 1`, `payment.status === 'completed'`

### 1c. Webhook Idempotency (Integration Level)

**Test:** `'handles duplicate checkout.session.completed webhooks without re-enqueueing'`

1. Same setup as 1b through step 9 (first webhook fires)
2. Wait for terminal status → `completed`
3. Send the exact same webhook again → 200
4. Assert: only one conversion in DB, status still `completed`, `conversion_events` table has no duplicate `payment_status_changed` entries

### 1d. Duplicate Convert Retry

**Test:** `'returns current status without re-enqueueing when convert called for non-uploaded states'`

1. Upload + convert → queued/converting/completed
2. Call `POST /api/convert` again → 200 with current status (not re-enqueued)
3. Also: upload new file, exhaust quota → 402, call convert again → 402 same status

### 1e. Concurrent Queue Limit (Integration Level)

**Test:** `'limits concurrent conversions to 5 when submitting 6 jobs through the API'`

1. Register a converter that returns a never-resolving Promise (controlled via deferred/resolver)
2. Upload 6 files, convert all 6
3. Query DB: 5 in `converting`, 1 in `queued`
4. Resolve one converter → the 6th moves to `converting`

---

## Step 2: Add Security Tests

**File:** `tests/integration/security.test.ts` (new)

Uses the same `createTestSandbox`, `setupTestDb`, `createTestApp` pattern as `api.test.ts`.

### 2a. Path Traversal in Filenames

**Test:** `'uses UUID-based storage regardless of path traversal in uploaded filenames'`

- Upload file named `../../etc/passwd.md` for `markdown-to-pdf`
- Upload file named `..\\..\\windows\\system32\\config.md`
- Assert: upload succeeds (200), stored `inputFilePath` matches UUID pattern, no file outside `data/conversions/`
- Assert: `originalFilename` in DB preserves the user's name (for download Content-Disposition)

### 2b. Magic Byte Spoofing via HTTP

**Test:** `'rejects files with mismatched extension and content at the API level'`

- Upload a DjVu binary (`AT&TFORM`) with `.md` extension for `markdown-to-pdf` → rejection
- Upload random bytes with `.docx` extension for `docx-to-markdown` → rejection
- Assert: 400 status with `error: 'invalid_file'` and user-friendly message
- Assert: no file on disk, no DB row created

### 2c. Oversized File Upload

**Test:** `'rejects files exceeding 10MB at the API level'`

- Upload `Buffer.alloc(10 * 1024 * 1024 + 1, 0x61)` as `.md` for `markdown-to-pdf`
- Assert: 400/413 with `error: 'file_too_large'`
- Assert: no file on disk, no DB row

### 2d. Weasyprint SSRF Args Verification

**Test:** `'weasyprint converter passes --base-url /dev/null to prevent local file resolution'`

- This is a unit-level test but placed here for security clarity
- Mock `spawnWithSignal`, call `weasyprintConverter.convert()`
- Assert args include `'--base-url'` and `'/dev/null'`
- Assert no `--allow-*` or `--enable-*` flags

---

## Step 3: Create Fixture Test Infrastructure

### 3a. Shared Helpers

**File:** `tests/fixtures/helpers.ts` (new)

Provides:
- `isToolAvailable(toolName)` — spawn `tool --version`, return true if exit 0
- `createFixtureDir()` — mkdtemp + registerTempRoot
- `fixturePath(category, filename)` — resolves to `tests/fixtures/samples/{category}/{filename}`
- `expectOutputExists(path)` — stat + non-zero size
- `expectPdfOutput(path)` — check `%PDF` magic bytes
- `expectMobiOutput(path)` — check `BOOKMOBI` magic
- `expectOutputContains(path, text)` — read + includes check

### 3b. Sample Fixture Documents

**Directory:** `tests/fixtures/samples/{format}/`

**Text formats** (write directly in the generation script):

| Format | Files | Content Strategy |
|--------|-------|-----------------|
| `markdown/` | `simple-text.md`, `headings-lists.md`, `tables.md`, `images.md`, `corrupted.md` | CommonMark with GFM tables, image refs, invalid UTF-8 bytes for corrupted |
| `html/` | `simple-text.html`, `headings-lists.html`, `tables.html`, `images.html`, `corrupted.html` | Full `<!DOCTYPE>` docs with inline CSS |
| `latex/` | `simple-text.tex`, `headings-lists.tex`, `tables.tex`, `math-formulas.tex`, `corrupted.tex` | `\documentclass{article}`, `\section`, `\begin{tabular}`, `\begin{equation}` |

**ZIP-based formats** (built programmatically using `buildZip()` from `tests/smoke/tooling-smoke.test.ts`):

| Format | Files | Content Strategy |
|--------|-------|-----------------|
| `docx/` | `simple-text.docx`, `headings-lists.docx`, `tables.docx`, `images.docx`, `corrupted.docx` | Minimal OOXML: `[Content_Types].xml` + `word/document.xml` |
| `odt/` | `simple-text.odt`, `headings-lists.odt`, `tables.odt`, `images.odt`, `corrupted.odt` | Reuse `buildMinimalOdt()` pattern with richer content.xml |
| `epub/` | `simple-text.epub`, `headings-lists.epub`, `tables.epub`, `images.epub`, `corrupted.epub` | Reuse `buildMinimalEpub()` with richer XHTML chapter |

**DjVu** (only 2 files — raster format, no semantic structure):
- `djvu/simple-page.djvu` — Generate from tiny PBM using `cjb2` in Docker, commit binary
- `djvu/corrupted.djvu` — First 8 bytes of valid DjVu (truncated)

**Corrupted variants:** Truncate valid file at 50% or fill with random bytes.

### 3c. Fixture Generation Script

**File:** `scripts/generate-fixtures.mjs` (new)

- Generates all text fixtures (MD, HTML, TEX) as plain files
- Builds ZIP-based fixtures (DOCX, ODT, EPUB) programmatically
- Creates corrupted variants (truncation + random bytes)
- Prints instructions for DjVu generation (requires Docker + cjb2)
- Idempotent — can re-run safely

### 3d. Seven Fixture Test Files

Each file under `tests/fixtures/`:

| File | Tool | Output Checks |
|------|------|--------------|
| `docx-to-markdown.test.ts` | pandoc | Valid markdown text, headings/lists preserved |
| `markdown-to-pdf.test.ts` | pandoc + weasyprint | `%PDF` magic, non-zero size |
| `html-to-pdf.test.ts` | weasyprint | `%PDF` magic, non-zero size |
| `djvu-to-pdf.test.ts` | ddjvu | `%PDF` magic (only 2 fixtures) |
| `epub-to-mobi.test.ts` | ebook-convert | `BOOKMOBI` magic |
| `odt-to-docx.test.ts` | pandoc | Valid ZIP with `word/` entries |
| `latex-to-pdf.test.ts` | pdflatex | `%PDF` magic |

Each test:
- Checks tool availability via `isToolAvailable()` → `describe.skip` if missing
- 60s timeout per test case
- Calls converter directly (not via API) for isolation
- Corrupted file tests assert `success === false` or graceful error, not crash

**Existing config handles exclusion:** `vitest.config.ts` already excludes `tests/fixtures/**`. `npm run test:fixtures` runs them separately.

---

## Step 4: Alert-Check .NET Tests

### 4a. Refactor Program.cs

**File:** `tools/alert-check/AlertLogic.cs` (new)

Extract testable static methods from `Program.cs` (lines 46-91, 105-111, 135, 156-185):

```csharp
public static class AlertLogic
{
    public static List<string> EvaluateMetrics(JsonNode? json)  // threshold checks
    public static List<string> FilterSuppressedAlerts(List<string> alerts, Dictionary<string, DateTime> state, DateTime now)
    public static string FormatAlertBody(List<string> alerts)
    public static string ExtractAlertKey(string alert)  // split on ':'
    public static Dictionary<string, DateTime> LoadState(string path)
    public static void SaveState(string path, Dictionary<string, DateTime> state)
}
```

Update `Program.cs` to call `AlertLogic.*` methods instead of inline code.

### 4b. Test Project

**File:** `tools/alert-check-tests/alert-check-tests.csproj` (new)

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.*" />
    <PackageReference Include="xunit" Version="2.*" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.*" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="..\alert-check\alert-check.csproj" />
  </ItemGroup>
</Project>
```

**Note:** `PublishAot` in the main project only activates during `dotnet publish`, not `dotnet test`, so the reference works.

### 4c. Test Files

**`ThresholdEvaluationTests.cs`** (~10 tests):
- All metrics normal → no alerts
- `usedPercent > 80` → `disk_high`
- `queuedJobs > 20` → `queue_backlog`
- `stalledJobs > 0` → `queue_stalled`
- `successRate < 75 && total > 0` → `error_rate_high`
- `successRate: 0, total: 0` → no error_rate alert (zero-division guard)
- `artifactMissing > 0` → `artifact_missing`
- `lastSuccessfulAt > 30min ago` → `no_recent_success`
- Multiple thresholds breached simultaneously → multiple alerts

**`DeduplicationTests.cs`** (~8 tests):
- New alert not in state → passes through
- Alert within 1hr window → suppressed
- Alert past 1hr window → passes through
- Mixed alerts → correct filtering
- `LoadState` missing file → empty dict
- `LoadState` corrupted JSON → empty dict
- `SaveState` creates directory if missing
- `SaveState` round-trips correctly

**`AlertFormattingTests.cs`** (~4 tests):
- Single alert formatting
- Multiple alerts joined with `\n`
- Empty alerts → empty string
- `ExtractAlertKey` splits on first `:`

---

## Implementation Order

```
Step 1 (Integration tests) ──┐
                              ├── can run in parallel
Step 2 (Security tests)   ───┘

Step 3a-3c (Fixture infra) ── then ── Step 3d (Fixture test files)

Step 4a (Refactor Program.cs) ── then ── Step 4b-4c (.NET tests)
```

Steps 1+2 are independent of Steps 3+4 and can be parallelized.

---

## Key Files to Modify

| File | Action |
|------|--------|
| `tests/integration/api.test.ts` | Add Stripe mocks + 4 new integration tests |
| `tests/integration/security.test.ts` | **Create** — 4 security tests |
| `tests/fixtures/helpers.ts` | **Create** — shared fixture test utilities |
| `tests/fixtures/samples/**` | **Create** — ~35 fixture documents |
| `tests/fixtures/*.test.ts` (7 files) | **Create** — 7 conversion quality test files |
| `scripts/generate-fixtures.mjs` | **Create** — fixture generation script |
| `tools/alert-check/AlertLogic.cs` | **Create** — extracted testable logic |
| `tools/alert-check/Program.cs` | Modify — call `AlertLogic.*` methods |
| `tools/alert-check-tests/alert-check-tests.csproj` | **Create** — xUnit test project |
| `tools/alert-check-tests/*.cs` (3 files) | **Create** — threshold, dedup, formatting tests |

## Reusable Existing Code

- `buildZip()`, `buildMinimalOdt()`, `buildMinimalEpub()`, `buildTinyPbm()` from `tests/smoke/tooling-smoke.test.ts:36-227`
- `createTestSandbox()`, `setupTestDb()` from `tests/helpers/test-env.ts`
- `createTestApp()` from `tests/helpers/create-test-app.ts`
- `registerTempRoot()` from `tests/setup.ts`
- Stripe mock pattern from `tests/unit/stripe.test.ts:10-27`
- Converter imports from `app/lib/converters/*.ts`

## Verification

1. **Integration + security tests:** `npm test` — all 4+4 new tests pass alongside existing 249
2. **Fixture tests:** `npm run test:fixtures` — passes with `--passWithNoTests` locally; fully passes in Docker with tools installed
3. **.NET tests:** `cd tools/alert-check-tests && dotnet test` — all threshold, dedup, and formatting tests pass
4. **Existing tests unbroken:** `npm test` still passes with no regressions (Stripe mock in `api.test.ts` doesn't affect existing tests that don't touch Stripe)
5. **Full count target:** ~270+ tests across 40+ files
