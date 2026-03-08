# Phase 2: Converter Wrappers — Implementation Plan

## Context

Phase 1 (Foundation) is complete: the `Converter` interface, registry, queue, rate limiting, file validation, and Stripe integration are all implemented. All 6 converter files exist as single-line comment stubs. This phase implements the actual converter wrappers that spawn external tools (`pandoc`, `ddjvu`, `ebook-convert`, `weasyprint`, `pdflatex`, `libreoffice`) as child processes, plus a shared spawn helper and unit tests for each.

This phase does NOT, by itself, satisfy the full sandboxing requirements from the spec. The wrappers can normalize process invocation, cancellation, error handling, and temp-file cleanup, but outbound-network isolation for HTML->PDF, reduced Linux capabilities, and per-process memory limits must still be enforced by the runtime/container design. The plan below treats those runtime guarantees as explicit prerequisites, not as properties implied by wrapper flags.

---

## Step 1: Create `spawnWithSignal` helper

**Create:** `app/lib/converters/spawn-helper.ts`

Shared helper wrapping `child_process.spawn` with promise semantics:

```typescript
export interface SpawnResult {
  exitCode: number
  stdout: string
  stderr: string
}

export async function spawnWithSignal(
  cmd: string,
  args: string[],
  signal: AbortSignal,
  opts?: SpawnOptionsWithoutStdio,
): Promise<SpawnResult>
```

- Uses `spawn()` with the `signal` option (Node sends SIGTERM on abort).
- Collects stdout/stderr via `data` events.
- Resolves on `close` with `{ exitCode, stdout, stderr }`.
- On `error`: re-throws `AbortError` (for queue timeout handling), wraps ENOENT as a descriptive error (`"Tool 'pandoc' is not installed"`).
- Does NOT handle timeouts — the queue already manages the AbortController + 30s setTimeout.
- Does NOT claim to enforce `--network=none`, `--cap-drop=ALL`, or memory limits; those belong to the execution environment outside this helper.

**Create:** `tests/unit/converters/spawn-helper.test.ts`

Tests using real child processes (no mocking — it's a thin wrapper):
- Resolves with exitCode 0 + correct stdout for `echo hello`
- Resolves with non-zero exit for `sh -c 'exit 42'`
- Rejects with AbortError when signal fires during `sleep`
- Rejects with descriptive error for non-existent binary
- Collects stderr separately from stdout
- Respects `cwd` option

---

## Step 2: Implement `djvulibre` converter

**Implement:** `app/lib/converters/djvulibre.ts`

Simplest converter — single command, no output path quirks.

- Command: `ddjvu -format=pdf inputPath outputPath`
- Records `Date.now()` before/after for `durationMs`
- Returns `ConvertResult` from the interface
- Re-throws AbortError, catches ENOENT, truncates stderr for error messages
- Exports `djvulibreConverter` for explicit registration from `register-all.ts`

**Create:** `tests/unit/converters/djvulibre.test.ts`

Mocks `~/lib/converters/spawn-helper`. Tests:
- Correct command (`ddjvu`) and args (`-format=pdf`, inputPath, outputPath)
- Success path returns `{ success: true, exitCode: 0 }`
- Non-zero exit returns `{ success: false }` with stderr as errorMessage
- AbortSignal forwarded to spawnWithSignal
- AbortError re-thrown (not swallowed)
- ENOENT returns `{ success: false }` with descriptive message

---

## Step 3: Implement `calibre` converter

**Implement:** `app/lib/converters/calibre.ts`

- Command: `ebook-convert inputPath outputPath`
- Same pattern as djvulibre
- Exports `calibreConverter` for explicit registration from `register-all.ts`

**Create:** `tests/unit/converters/calibre.test.ts` — same test pattern as djvulibre.

---

## Step 4: Implement `weasyprint` converter

**Implement:** `app/lib/converters/weasyprint.ts`

- Command: `weasyprint inputPath outputPath --presentational-hints --base-url /dev/null`
- `--presentational-hints`: respects HTML attributes for better fidelity
- `--base-url /dev/null`: only constrains local relative resource resolution; it is not sufficient SSRF protection on its own
- Runtime prerequisite: the HTML->PDF execution environment must have no outbound network access (`--network=none` or equivalent) before this converter is considered launch-ready
- Exports `weasyprintConverter` for explicit registration from `register-all.ts`

**Create:** `tests/unit/converters/weasyprint.test.ts`

Same pattern as others, plus:
- Verifies `--presentational-hints` is in args
- Verifies `--base-url` `/dev/null` is in args
- Verifies docs/comments do not claim SSRF protection from wrapper flags alone

---

## Step 5: Implement `pandoc` converter

**Implement:** `app/lib/converters/pandoc.ts`

Handles 3 conversion types, determined by input/output file extensions:

| Input ext | Output ext | Extra args |
|-----------|-----------|------------|
| `.docx` | `.md` | `-t markdown` |
| `.md`/`.markdown` | `.pdf` | `--pdf-engine=weasyprint` |
| `.odt` | `.docx` | (none — pandoc infers) |

Base args: `pandoc inputPath -o outputPath` + type-specific args.

- Exports `pandocConverter` for explicit registration from `register-all.ts`

**Create:** `tests/unit/converters/pandoc.test.ts`

Three `describe` blocks (one per conversion type):
- DOCX→MD: verifies `-t markdown` in args
- MD→PDF: verifies `--pdf-engine=weasyprint` in args
- ODT→DOCX: verifies no extra flags
- Plus standard success/failure/abort tests for each

---

## Step 6: Implement `pdflatex` converter

**Implement:** `app/lib/converters/pdflatex.ts`

Most complex due to output path handling:

- Command: `pdflatex -interaction=nonstopmode -halt-on-error -output-directory=<dir> inputPath`
- Run inside a per-job temp working directory to contain `.aux`, `.log`, `.out`, `.toc`, and any partial outputs
- pdflatex names output after input (`input.tex` → `input.pdf`), so rename to expected `outputPath` after completion
- Clean up the per-job temp directory in `finally`, including failure and timeout paths
- pdflatex errors go to **stdout** (not stderr) — extract lines starting with `!`
- Exports `pdflatexConverter` for explicit registration from `register-all.ts`

**Create:** `tests/unit/converters/pdflatex.test.ts`

Mocks both `spawn-helper` and `node:fs` (for rename/rm):
- Verifies `-interaction=nonstopmode`, `-halt-on-error`, `-output-directory` in args
- Verifies `fs.promises.rename` called to move output to expected path
- Verifies temp-directory cleanup runs in both success and failure paths
- Error extraction from stdout (lines starting with `!`)

---

## Step 7: Implement `libreoffice` converter

**Implement:** `app/lib/converters/libreoffice.ts`

Fallback for ODT→DOCX (not actively used in v1 since `odt-to-docx` maps to `toolName: 'pandoc'`):

- Command: `libreoffice --headless --convert-to docx --outdir <dir> inputPath`
- LibreOffice names output after input — rename to expected `outputPath`
- Set unique `UserInstallation` env per invocation to prevent lock file conflicts: `-env:UserInstallation=file://<tmpdir>/lo-<uuid>`
- Remove the temp LibreOffice profile directory in `finally`
- Exports `libreofficeConverter` for explicit registration from `register-all.ts`

**Create:** `tests/unit/converters/libreoffice.test.ts`

- Verifies `--headless`, `--convert-to docx`, `--outdir` in args
- Verifies `-env:UserInstallation` flag is present
- Verifies output rename logic
- Verifies temp profile cleanup

---

## Step 8: Create `register-all.ts` and integrate

**Create:** `app/lib/converters/register-all.ts`

Explicit bootstrap with an idempotent registrar:

```typescript
let registered = false

export function registerAllConverters(): void {
  if (registered) return
  registered = true

  registerConverter('pandoc', pandocConverter)
  registerConverter('djvulibre', djvulibreConverter)
  registerConverter('calibre', calibreConverter)
  registerConverter('weasyprint', weasyprintConverter)
  registerConverter('pdflatex', pdflatexConverter)
  registerConverter('libreoffice', libreofficeConverter)
}
```

**Do NOT call from `queue.ts`** — the queue tests mock converters manually and implicit bootstrap there would break them. Call `registerAllConverters()` from the server entry point (Phase 3) and from any smoke-test harness that wants the real registry.

**Add to existing `tests/unit/converters/index.test.ts`:**

A new test verifying all 6 converters are registered after calling `registerAllConverters()`, and that repeated calls are idempotent.

---

## Common Converter Pattern

Every converter follows this structure:

```typescript
import type { Converter, ConvertResult } from '~/lib/converters/index'
import { spawnWithSignal } from '~/lib/converters/spawn-helper'

export const toolConverter: Converter = {
  async convert(inputPath, outputPath, signal): Promise<ConvertResult> {
    const start = Date.now()
    try {
      const result = await spawnWithSignal(CMD, ARGS, signal)
      const durationMs = Date.now() - start
      return {
        success: result.exitCode === 0,
        outputPath,
        exitCode: result.exitCode,
        errorMessage: result.exitCode !== 0 ? sanitizeToolError(result.stderr) : undefined,
        durationMs,
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err  // let queue handle timeout
      return { success: false, outputPath, exitCode: -1, errorMessage: ..., durationMs: ... }
    }
    finally {
      await cleanupTempArtifacts()
    }
  },
}
```

Error messages truncated to 500 chars, ANSI codes stripped, server paths removed.

---

## Files Summary

| File | Action |
|------|--------|
| `app/lib/converters/spawn-helper.ts` | **Create** |
| `app/lib/converters/djvulibre.ts` | **Implement** (replace stub) |
| `app/lib/converters/calibre.ts` | **Implement** (replace stub) |
| `app/lib/converters/weasyprint.ts` | **Implement** (replace stub) |
| `app/lib/converters/pandoc.ts` | **Implement** (replace stub) |
| `app/lib/converters/pdflatex.ts` | **Implement** (replace stub) |
| `app/lib/converters/libreoffice.ts` | **Implement** (replace stub) |
| `app/lib/converters/register-all.ts` | **Create** |
| `tests/unit/converters/spawn-helper.test.ts` | **Create** |
| `tests/unit/converters/djvulibre.test.ts` | **Create** |
| `tests/unit/converters/calibre.test.ts` | **Create** |
| `tests/unit/converters/weasyprint.test.ts` | **Create** |
| `tests/unit/converters/pandoc.test.ts` | **Create** |
| `tests/unit/converters/pdflatex.test.ts` | **Create** |
| `tests/unit/converters/libreoffice.test.ts` | **Create** |
| `tests/unit/converters/index.test.ts` | **Modify** (add register-all test) |

---

## Verification

1. Run `npm test` — all existing tests pass + new converter tests pass
2. Run `npm run type-check` — no TypeScript errors
3. Run `npm run lint` — no lint errors
4. Manual smoke test (if conversion tools installed): call `registerAllConverters()`, then `getConverter('pandoc')`, then invoke `.convert()` on a sample `.docx` file
5. Manual security verification: confirm the runtime used for HTML->PDF actually has no outbound network access before considering that converter production-ready
