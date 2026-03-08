# Phase 1: Foundation — Dependencies, DB, Core Utilities

## Context

WittyFlip is at ~20% completion (infrastructure only). All business logic files are single-line comment placeholders. Phase 1 is the critical foundation that all subsequent phases depend on (converters, API routes, payments, UI). This plan implements the 6 core utility modules + the converter interface skeleton + ESLint setup.

### Assumptions

- **Single process:** Phase 1 assumes a single Node.js app process. The in-process queue runner is safe under SQLite's single-writer model. Multi-process-safe job claiming is deferred to a future scaling phase.
- **No converters registered:** Phase 2 provides actual converter wrappers. During Phase 1, no converters are registered in the registry, so `getConverter()` returns `undefined` and the queue gracefully fails with "Converter not available".

---

## Step 0: Install Dependencies, ESLint Setup, Schema Update, DB Migration

### 0.1 Add npm dependencies

**Modify:** `package.json`

Production deps:
- `file-type` (magic byte detection, ESM-only v19+)

Dev deps:
- `eslint` + `@eslint/js` + `typescript-eslint` (flat config format)

No need for:
- `uuid` — use built-in `crypto.randomUUID()` (Node 20)
- `node-cron`, `marked`, `gray-matter`, `@tailwindcss/typography` — defer to their respective phases

### 0.2 ESLint setup

Create `eslint.config.js` (flat config) with:
- `@eslint/js` recommended rules
- `typescript-eslint` recommended type-checked rules
- Parser configured for the project's tsconfig
- Ignore `node_modules/`, `dist/`, `.output/`, `drizzle/`

Update `package.json` lint script to use the new config (it already has `"lint": "eslint ."`).

### 0.3 Schema update — add `inputFilePath` column

**Modify:** `app/lib/db/schema.ts`

Add a new column to the `conversions` table:
```ts
inputFilePath: text('input_file_path').notNull(), // e.g., "{uuid}.md" — exact saved filename on disk
```

This is `notNull()` because every uploaded file must have a saved filename. Since this is a fresh migration (no existing data), the constraint is safe to add.

This stores the exact filename used when saving to disk at upload time, avoiding the need to reconstruct paths from format metadata (which fails for `.md` vs `.markdown`, `.html` vs `.htm`).

### 0.4 Generate and commit Drizzle migration

The `drizzle/` directory does not currently exist. Generate the initial migration files from the schema:

```bash
npm install
mkdir -p data/conversions
npm run db:generate   # Creates drizzle/ with migration SQL
npm run db:migrate    # Applies migration to data/sqlite.db
```

The generated migration files in `drizzle/` should be committed to the repo so deployments can run `db:migrate` reproducibly.

**Verify:** `npm run type-check` passes. `npm run lint` passes. `data/sqlite.db` has 3 tables including the new `input_file_path` column.

---

## Step 1: Conversion Definitions — `app/lib/conversions.ts`

Zero runtime dependencies. Define types and the 7 conversion entries.

### Types

```ts
export interface ConversionFAQ {
  question: string
  answer: string
}

export interface ConversionSEO {
  title: string        // e.g., "Convert DOCX to Markdown Online Free | WittyFlip"
  description: string  // meta description, ~155 chars
  h1: string           // e.g., "Convert DOCX to Markdown"
  keywords: string[]
}

export interface ConversionType {
  slug: string                  // URL slug, e.g., "docx-to-markdown"
  sourceFormat: string          // e.g., "docx"
  targetFormat: string          // e.g., "markdown"
  sourceExtensions: string[]    // e.g., [".docx"]
  sourceMimeTypes: string[]     // for file-type validation
  targetExtension: string       // e.g., ".md"
  targetMimeType: string
  toolName: string              // matches converter registry key
  formatColor: string           // hex for UI accent
  seo: ConversionSEO
  seoContent: string            // 300-500 words HTML
  faq: ConversionFAQ[]          // 3-5 items
  relatedConversions: string[]  // slugs for internal linking
}
```

### Data structure

Use a **typed `const` array** as the canonical source of truth, then derive helpers from it:

```ts
const CONVERSION_TYPES = [
  { slug: 'docx-to-markdown', ... },
  { slug: 'markdown-to-pdf', ... },
  ...
] as const satisfies readonly ConversionType[]
```

The 7 entries:

| slug | sourceExtensions | targetExt | tool | color |
|------|------------------|-----------|------|-------|
| docx-to-markdown | [".docx"] | .md | pandoc | #2563eb (blue) |
| markdown-to-pdf | [".md", ".markdown"] | .pdf | pandoc | #9333ea (purple) |
| html-to-pdf | [".html", ".htm"] | .pdf | weasyprint | #dc2626 (red) |
| djvu-to-pdf | [".djvu"] | .pdf | djvulibre | #d97706 (amber) |
| epub-to-mobi | [".epub"] | .mobi | calibre | #0d9488 (teal) |
| odt-to-docx | [".odt"] | .docx | pandoc | #ea580c (orange) |
| latex-to-pdf | [".tex"] | .pdf | pdflatex | #16a34a (green) |

### Helpers (derived from the array)

```ts
// Build a Map lazily from the array for O(1) lookup
const slugIndex = new Map(CONVERSION_TYPES.map(c => [c.slug, c]))

export function getConversionBySlug(slug: string): ConversionType | undefined
export function isValidConversionType(slug: string): boolean
export function getAllConversionTypes(): ConversionType[]  // returns a shallow copy to prevent mutation of the canonical array
```

---

## Step 2: File Validation — `app/lib/file-validation.ts`

**Depends on:** `file-type`, `conversions.ts`

```ts
export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export interface ValidationResult {
  valid: boolean
  error?: string
}

export async function validateFile(
  buffer: Buffer | Uint8Array,
  declaredFilename: string,
  conversionType: string,
): Promise<ValidationResult>
```

### Logic

1. Validate conversion type exists via `getConversionBySlug()`
2. Check `buffer.byteLength > 0` (reject empty), `<= MAX_FILE_SIZE` (reject oversized)
3. Extract extension via `path.extname(declaredFilename).toLowerCase()`, check against `conversion.sourceExtensions`
4. **Text formats** (.md, .markdown, .tex, .html, .htm): skip magic bytes, validate UTF-8 via `new TextDecoder('utf-8', { fatal: true }).decode(buffer)`
5. **DjVu format** (.djvu): custom magic byte check. Do NOT use `file-type` for DjVu. Validate the full DjVu IFF header:
   - Bytes 0–3: `AT&T` (hex `41 54 26 54`)
   - Bytes 4–7: `FORM` (hex `46 4F 52 4D`)
   - Bytes 12–15: DjVu chunk marker — must be `DJVU` (single-page) or `DJVM` (multi-page)

   `AT&TFORM` alone only identifies a generic IFF container. The chunk marker at bytes 12–15 confirms it is actually a DjVu document.
6. **ZIP-based binary formats** (.docx, .epub, .odt): call `fileTypeFromBuffer()`, accept both the specific MIME and `application/zip` (since all three are ZIP containers), combined with the extension check already done in step 3.

---

## Step 3: Rate Limiting — `app/lib/rate-limit.ts`

**Depends on:** `~/lib/db`, `~/lib/db/schema` (rateLimits table)

```ts
export const FREE_DAILY_LIMIT = 2

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number      // Always FREE_DAILY_LIMIT
  resetAt: string    // ISO 8601 midnight UTC next day
}

export async function checkRateLimit(ip: string): Promise<RateLimitResult>
export async function incrementRateLimit(ip: string): Promise<void>
```

- **Key:** IP + UTC date (`YYYY-MM-DD`) via `new Date().toISOString().slice(0, 10)`
- **checkRateLimit:** query `rateLimits` for today's row, return `remaining = FREE_DAILY_LIMIT - count`
- **incrementRateLimit:** upsert pattern. Try Drizzle's `onConflictDoUpdate` targeting `[rateLimits.ipAddress, rateLimits.date]`. If Drizzle can't resolve the raw SQL unique constraint, fall back to select-then-insert/update (safe in SQLite single-writer — see Assumptions).
- **resetAt:** midnight UTC next day: `new Date(Date.UTC(year, month, day + 1)).toISOString()`
- Only called after successful free conversion (never on failure/paid)

---

## Step 4: Converter Interface + Placeholders

### 4.1 Registry — `app/lib/converters/index.ts`

Minimal skeleton for Phase 1. The key design: **AbortSignal** is part of the `Converter` interface so the queue can enforce timeouts cleanly and Phase 2 wrappers can pass the signal to `spawn(..., { signal })`.

```ts
export interface ConvertResult {
  success: boolean
  outputPath: string
  exitCode: number
  errorMessage?: string
  durationMs: number
}

export interface Converter {
  convert(inputPath: string, outputPath: string, signal: AbortSignal): Promise<ConvertResult>
}

const converterRegistry = new Map<string, Converter>()

export function getConverter(toolName: string): Converter | undefined {
  return converterRegistry.get(toolName)
}

export function registerConverter(toolName: string, converter: Converter): void {
  converterRegistry.set(toolName, converter)
}
```

### 4.2 Create pdflatex placeholder — `app/lib/converters/pdflatex.ts`

The repo has placeholder files for pandoc, weasyprint, djvulibre, calibre, libreoffice but is missing `pdflatex.ts`. Create it now:

```ts
// pdflatex wrapper for LaTeX->PDF conversions
```

This keeps the registry and conversion definitions aligned. All 7 converter files remain as comment placeholders until Phase 2.

---

## Step 5: Conversion Queue — `app/lib/queue.ts`

**Depends on:** `~/lib/db`, `~/lib/db/schema`, `~/lib/rate-limit`, `~/lib/converters`, `~/lib/conversions`

### Constants

```ts
const MAX_CONCURRENT_JOBS = 5
const CONVERSION_TIMEOUT_MS = 30_000       // 30 seconds
const DOWNLOAD_WINDOW_MS = 60 * 60 * 1000  // 1 hour

export const CONVERSIONS_DIR = path.resolve('data', 'conversions')
```

### Concurrency model

**Single-process in-process queue runner.** Only one `processQueue()` loop runs at a time, guarded by a module-level boolean flag (`isProcessing`). This prevents duplicate job starts from concurrent `processQueue()` calls triggered by multiple `enqueueJob` or completion callbacks firing close together.

Multi-process-safe atomic job claiming (e.g., `UPDATE ... WHERE status='queued' RETURNING`) is deferred. For Phase 1, the single-process model with SQLite is sufficient for launch.

### Functions

**`enqueueJob(fileId: string): Promise<void>`**
- Update conversion row: `status = 'queued'`
- Fire-and-forget: `processQueue()` (do not await)

**`processQueue(): Promise<void>`**
- If `isProcessing` flag is set, return immediately (prevents re-entrant runs)
- Set `isProcessing = true` in try/finally
- Loop:
  1. Count rows where `status = 'converting'`. If >= MAX_CONCURRENT_JOBS, break.
  2. Select oldest row where `status = 'queued'`, ordered by `createdAt ASC`, limit 1. If none, break.
  3. **Claim the job atomically:** `UPDATE conversions SET status='converting', conversionStartedAt=now WHERE id=job.id AND status='queued'`. Verify 1 row was updated. If 0 rows affected, skip (job was claimed elsewhere) and continue loop. This makes the claim step precise and easier to evolve for multi-process later.
  4. Fire-and-forget `runConversion(claimedJob)` (do not await — allows parallel jobs). Pass the row data from the original select result; do NOT refetch by ID, as that would reintroduce a race window between claim and execution.
  5. Continue loop for remaining slots.
- Set `isProcessing = false` in finally

**`runConversion(job: ConversionRow): Promise<void>`**

Receives an already-claimed job row (status already set to `converting` by processQueue). All fields are accessed via `job.*` — no refetching.

1. Look up conversion metadata: `getConversionBySlug(job.conversionType)`. If undefined → update `job.id` to `status = 'failed'`, `errorMessage = 'Unknown conversion type'`, call `processQueue()`, return.
2. Get converter: `getConverter(conversionMeta.toolName)`. If undefined → update `job.id` to `status = 'failed'`, `errorMessage = 'Converter not available'`, call `processQueue()`, return.
3. Build paths:
   - Input: `path.join(CONVERSIONS_DIR, job.inputFilePath)` — e.g., `data/conversions/{uuid}.md`
   - Output: `path.join(CONVERSIONS_DIR, job.id + '-output' + conversionMeta.targetExtension)` — e.g., `data/conversions/{uuid}-output.pdf`
4. Create `AbortController`, set timeout:
   ```ts
   const controller = new AbortController()
   const timeoutId = setTimeout(() => controller.abort(), CONVERSION_TIMEOUT_MS)
   ```
5. Call `converter.convert(inputPath, outputPath, controller.signal)`.
6. Clear timeout.
7. **On success:** update `job.id`: status → `completed`, set `expiresAt = now + DOWNLOAD_WINDOW_MS`, record `toolExitCode`, `conversionTimeMs`, `outputFileSizeBytes`, `conversionCompletedAt`. If `job.wasPaid === 0`, call `incrementRateLimit(job.ipAddress)`.
8. **On failure** (result.success false): update `job.id`: status → `failed`, record error. Do NOT increment rate limit.
9. **On AbortError** (timeout): update `job.id`: status → `timeout`, errorMessage = "Conversion timed out. The file may be too complex." Do NOT increment rate limit.
10. **Finally:** call `processQueue()` to drain remaining queued jobs.

---

## Step 6: Stripe Integration — `app/lib/stripe.ts`

**Depends on:** `stripe` (already installed), `~/lib/db`, `~/lib/db/schema`, `~/lib/queue`

### Initialization

```ts
import Stripe from 'stripe'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY
if (!stripeSecretKey) {
  console.warn('STRIPE_SECRET_KEY is not set. Stripe integration will not work.')
}

// Omit apiVersion — use SDK default
export const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null
```

### Functions

**`createCheckoutSession(fileId: string): Promise<{ checkoutUrl, sessionId }>`**

Trust boundary: accepts only `fileId`. Loads the conversion row server-side and derives all data (conversionType, IP) from the DB — the DB is authoritative:

1. Fetch conversion row by `fileId`. If not found or `status !== 'payment_required'`, throw.
2. Derive `conversionType` from `conversion.conversionType`, `ip` from `conversion.ipAddress`.
3. If `stripe` is null, throw "Payment system is not configured."
4. Create Stripe Checkout session:
   - `mode: 'payment'`, `payment_method_types: ['card']`
   - `line_items`: 1 item, $0.49 (`unit_amount: 49`, `currency: 'usd'`)
   - `metadata: { fileId, conversionType }` (server-derived)
   - `success_url`: `${BASE_URL}/${conversionType}?fileId=${fileId}&session_id={CHECKOUT_SESSION_ID}`
   - `cancel_url`: `${BASE_URL}/${conversionType}?fileId=${fileId}&canceled=true`
   - `expires_at`: now + 30 minutes (Unix timestamp)
5. **Wrap steps 6–7 in a transaction** to prevent partial state (payment inserted but conversion not updated):
6. Insert `payments` row with all required fields:
   - `fileId`: from conversion row
   - `stripeSessionId`: `session.id`
   - `amountCents`: 49
   - `currency`: 'usd'
   - `conversionType`: `conversion.conversionType` (derived from DB)
   - `ipAddress`: `conversion.ipAddress` (derived from DB, not caller)
   - `checkoutExpiresAt`: `new Date(session.expires_at! * 1000).toISOString()`
   - `status`: 'pending'
7. Update conversion: `status = 'pending_payment'`.
8. Return `{ checkoutUrl: session.url!, sessionId: session.id }`.

**`verifyWebhookSignature(rawBody, signature): Stripe.Event`**
- Call `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)`.
- Throws on invalid signature (let it propagate).

**`handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void>`**

Must be **idempotent** (Stripe webhooks may be retried):

1. Extract `fileId` from `session.metadata`. If `fileId` is missing or undefined, throw ("Missing fileId in Stripe session metadata").
2. Query `payments` by `stripeSessionId = session.id`. If no row found, throw ("No payment record found for Stripe session").
3. Fetch conversion row by `fileId`. If not found, throw ("No conversion record found for fileId"). Save `previousStatus = conversion.status`.
4. If payment row already has `status = 'completed'`:
   - **Recovery check:** if `previousStatus === 'pending_payment'`, call `enqueueJob(fileId)` (previous webhook crashed after marking payment complete but before enqueueing).
   - Return early (idempotent — all DB writes already done).
5. **Wrap steps 6–8 in a transaction** to prevent partial state:
6. Update `payments`: `status = 'completed'`, `stripePaymentIntent = session.payment_intent`, `completedAt = now`.
7. Update `conversions`: `wasPaid = 1`.
8. Transaction commits.
9. If `previousStatus === 'pending_payment'`, call `enqueueJob(fileId)`. Enqueue is outside the transaction because it triggers async work.

### Env

**Add to `.env.example`:** `BASE_URL=http://localhost:3000`

---

## Implementation Order

```
Step 0: npm install + ESLint setup + schema update + DB migration
  ↓
Step 1: conversions.ts (zero deps)
  ↓
Step 2: file-validation.ts (depends: conversions.ts, file-type)
  ↓  (can parallel with Step 3)
Step 3: rate-limit.ts (depends: db)
  ↓
Step 4: converters/index.ts interface + pdflatex.ts placeholder (zero deps)
  ↓
Step 5: queue.ts (depends: db, rate-limit, converters, conversions)
  ↓
Step 6: stripe.ts (depends: db, queue)
```

## Critical Files

| File | Action |
|------|--------|
| `package.json` | Add `file-type`, `eslint`, `@eslint/js`, `typescript-eslint` |
| `eslint.config.js` | **Create** — flat config for TypeScript |
| `app/lib/db/schema.ts` | Add `inputFilePath` column to conversions |
| `drizzle/` | **Generate** — initial migration files (commit to repo) |
| `app/lib/conversions.ts` | Full implementation |
| `app/lib/file-validation.ts` | Full implementation |
| `app/lib/rate-limit.ts` | Full implementation |
| `app/lib/converters/index.ts` | Interface + registry skeleton with AbortSignal |
| `app/lib/converters/pdflatex.ts` | **Create** — placeholder comment |
| `app/lib/queue.ts` | Full implementation |
| `app/lib/stripe.ts` | Full implementation |
| `.env.example` | Add `BASE_URL` |
| `app/lib/db/index.ts` | No changes (reuse as-is) |

## Verification

1. `npm run lint` — no ESLint errors
2. `npm run type-check` — no TypeScript errors
3. `npm run build` — successful build
4. Manual verification:
   - `getConversionBySlug('docx-to-markdown')` returns correct data; `getAllConversionTypes()` returns 7 items; `isValidConversionType('invalid')` returns false
   - `validateFile` rejects: oversized, empty, wrong extension, non-UTF8 text, DjVu with wrong magic bytes. Accepts: valid DOCX (ZIP-based), valid .md (text), valid DjVu (full header: `AT&TFORM` + chunk marker `DJVU`/`DJVM` at bytes 12–15)
   - `checkRateLimit('127.0.0.1')` → allowed=true, remaining=2. After 2× `incrementRateLimit` → allowed=false, remaining=0
   - `enqueueJob` sets status → `queued`; `runConversion` fails gracefully with "Converter not available" (no converters registered)
   - Queue: `processQueue` does not run re-entrantly (isProcessing guard)
   - Stripe initializes without crash when env vars missing (warning only)
   - `createCheckoutSession(fileId)` loads conversion row server-side; does not accept conversionType or ip from caller
   - `handleCheckoutCompleted` is idempotent and recovery-safe: duplicate webhook does not double-enqueue, but a retry after mid-crash still recovers a stuck `pending_payment` conversion
   - Both `createCheckoutSession` and `handleCheckoutCompleted` wrap related DB writes in transactions (no partial state)
