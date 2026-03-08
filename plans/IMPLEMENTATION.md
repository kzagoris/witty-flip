# WittyFlip Implementation Plan

## Context

WittyFlip is an online document conversion service (DOCX->Markdown, DJVU->PDF, etc.) targeting organic search. The project has infrastructure in place (~20%) — database schema, Docker/Caddy config, TanStack Start routing, Tailwind CSS — but all business logic, API routes, UI components, and converter wrappers are empty placeholders (single comment lines or stub `<div>`s). This plan covers the full implementation from placeholders to a launchable product.

---

## Phase 1: Foundation (Dependencies, DB, Core Utilities)

### 1.1 Install Missing npm Dependencies
- **Modify:** `package.json`
- **Add:** `file-type` (magic bytes), `uuid` + `@types/uuid`, `node-cron` (cleanup scheduler), `marked` + `gray-matter` (blog), `@tailwindcss/typography` (blog prose)
- **Verify:** `npm install && npm run type-check`

### 1.2 Generate & Apply DB Migration
- Run `npm run db:generate` then `npm run db:migrate`
- Schema at `app/lib/db/schema.ts` is already complete
- **Verify:** Confirm 3 tables exist in `data/sqlite.db`

### 1.3 Conversion Definitions (`app/lib/conversions.ts`)
- Export `CONVERSION_TYPES` map keyed by slug (e.g. `docx-to-markdown`)
- Each entry: slug, sourceFormat, targetFormat, extensions, MIME types, toolName, SEO title/description/h1, format color, seoContent (300-500 words), FAQ array, relatedConversions
- Export helpers: `getConversionBySlug()`, `isValidConversionType()`, `getAllConversionTypes()`

### 1.4 File Validation (`app/lib/file-validation.ts`)
- `validateFile(buffer, declaredExtension, conversionType)` -> `{ valid, error? }`
- Magic bytes via `fileTypeFromBuffer()` from `file-type`
- Size check: 10MB max
- Special handling for text formats (.md, .tex, .html) — no magic bytes, validate extension + UTF-8
- Clear user-friendly error messages

### 1.5 Rate Limiting (`app/lib/rate-limit.ts`)
- `checkRateLimit(ip)` -> `{ allowed, remaining, limit, resetAt }`
- `incrementRateLimit(ip)` — called only after successful free conversion
- Upsert pattern on `rate_limits` table, keyed by IP + UTC date
- `FREE_DAILY_LIMIT = 2`

### 1.6 Conversion Queue (`app/lib/queue.ts`)
- `enqueueJob(fileId)` — sets status to `queued`, calls `processQueue()`
- `processQueue()` — if `converting` count < 5, dequeue oldest `queued` job
- `startConversion(fileId)` — sets `converting`, calls converter, handles success/failure/timeout
- On success: status `completed`, set `expiresAt` = now + 1hr, increment rate limit if free
- On failure: status `failed`, do NOT consume quota
- On timeout (30s): kill subprocess, status `timeout`
- After each completion, call `processQueue()` again

---

## Phase 2: Converter Wrappers

### 2.1 Common Interface & Registry (`app/lib/converters/index.ts`)
- `Converter` interface with `convert(inputPath, outputPath) -> ConvertResult`
- `ConvertResult`: `{ success, outputPath, exitCode, errorMessage?, durationMs }`
- Shared `spawnWithTimeout(cmd, args, opts, timeoutMs)` helper using `child_process.spawn`
- `getConverter(toolName)` registry function

### 2.2 Pandoc (`app/lib/converters/pandoc.ts`)
- DOCX->MD: `pandoc input.docx -t markdown -o output.md`
- MD->PDF: `pandoc input.md -o output.pdf --pdf-engine=weasyprint`
- ODT->DOCX: `pandoc input.odt -o output.docx`

### 2.3 djvulibre (`app/lib/converters/djvulibre.ts`)
- DJVU->PDF: `ddjvu -format=pdf input.djvu output.pdf`

### 2.4 Calibre (`app/lib/converters/calibre.ts`)
- EPUB->MOBI: `ebook-convert input.epub output.mobi`

### 2.5 weasyprint (`app/lib/converters/weasyprint.ts`)
- HTML->PDF: `weasyprint input.html output.pdf`
- Security: no external resource fetching (SSRF protection)

### 2.6 pdflatex (`app/lib/converters/pdflatex.ts`) — **new file**
- LaTeX->PDF: `pdflatex -interaction=nonstopmode -output-directory=... input.tex`

### 2.7 LibreOffice (`app/lib/converters/libreoffice.ts`)
- ODT->DOCX fallback: `libreoffice --headless --convert-to docx`
- Lower priority — Pandoc is primary for this conversion

---

## Phase 3: API Routes

### Architecture Decision
- **Server functions** (`createServerFn`): upload, convert, conversion-status, create-checkout
- **Raw h3 handlers**: download (binary streaming), webhook/stripe (raw body for signature)

### 3.1 Custom Server Entry (`app/server/entry.ts`) — **new file**
- Compose h3 router mounting download + webhook handlers
- Pass all other requests to TanStack Start's SSR handler
- Update `vite.config.ts` to reference custom entry

### 3.2 Upload (`app/server/api/upload.ts`)
- `createServerFn({ method: 'POST' })` accepting FormData
- Generate UUID via `crypto.randomUUID()`
- Validate file (size, magic bytes, conversion type)
- Save to `data/conversions/{uuid}.{ext}`
- Insert `conversions` row with status `uploaded`
- Extract client IP from `X-Forwarded-For` header
- Return `{ fileId, status: 'uploaded' }`

### 3.3 Convert (`app/server/api/convert.ts`)
- `createServerFn({ method: 'POST' })` accepting `{ fileId }`
- Check rate limit -> enqueue or return `payment_required`

### 3.4 Conversion Status (`app/server/api/conversion-status.ts`)
- `createServerFn({ method: 'GET' })` accepting `{ fileId }`
- Return `{ fileId, status, downloadUrl?, expiresAt?, errorMessage? }`

### 3.5 Download (`app/server/api/download.ts`)
- Raw h3 handler at `GET /api/download/:fileId`
- Stream output file with proper Content-Type + Content-Disposition
- Reject expired or non-completed files

---

## Phase 4: Payment Flow (Stripe)

### 4.1 Stripe Client (`app/lib/stripe.ts`)
- Initialize Stripe SDK
- `createCheckoutSession(fileId, conversionType, ip)` — guest mode, $0.49, 30min expiry
- `verifyWebhookSignature(rawBody, signature)`
- Insert `payments` row, update conversion to `pending_payment`

### 4.2 Create Checkout (`app/server/api/create-checkout.ts`)
- Server function: verify conversion is `payment_required`, create session, return URL

### 4.3 Stripe Webhook (`app/server/api/webhook/stripe.ts`)
- Raw h3 handler at `POST /api/webhook/stripe`
- Verify signature, handle `checkout.session.completed`
- Update payment + conversion records, enqueue job

---

## Phase 5: UI Components

### 5.0 Design System (`app/styles/globals.css`)
- Google Fonts: Plus Jakarta Sans (headings), Inter (body)
- CSS variables for brand purple + 7 format colors
- Keyframe animations: pulse, slide-in, progress-bar, bounce, celebrate

### 5.1 Header (`app/components/Header.tsx`)
- Logo + "All Conversions" dropdown, responsive hamburger menu, sticky with backdrop blur

### 5.2 Footer (`app/components/Footer.tsx`)
- Privacy/Terms/Contact links, conversion links for SEO, trust signal

### 5.3 SEOHead (`app/components/SEOHead.tsx`)
- Open Graph, Twitter Cards, JSON-LD structured data (HowTo, SoftwareApplication, FAQPage)

### 5.4 FileUploader (`app/components/FileUploader.tsx`)
- Drag-and-drop + click to browse, format-specific accent color
- States: idle (pulse), dragging (highlight), uploading (progress), complete, error
- Client-side size/extension validation before upload
- Calls upload server function via FormData

### 5.5 ConversionProgress (`app/components/ConversionProgress.tsx`)
- Polls status every 1-2s while queued/converting
- Animated progress bar, format icon transformation animation

### 5.6 DownloadButton (`app/components/DownloadButton.tsx`)
- Bold button with bounce animation, green checkmark, expiry countdown timer

### 5.7 PaymentPrompt (`app/components/PaymentPrompt.tsx`)
- Rate limit message + "Pay & Convert" button -> Stripe Checkout redirect

### 5.8 AdBanner (`app/components/AdBanner.tsx`)
- AdSense wrapper, shown only for free conversions, dev placeholder until approval

### 5.9 ConversionCard (`app/components/ConversionCard.tsx`)
- Card with format color accent, source->target labels, hover scale effect

---

## Phase 6: Pages

### 6.1 Root Layout (`app/routes/__root.tsx`)
- Add Header + Footer wrapping Outlet, import globals.css, Google Fonts links

### 6.2 Homepage (`app/routes/index.tsx`)
- Gradient hero: "Free Online Document Converter"
- Grid of 7 ConversionCards, trust signals section
- SSR loader with conversion metadata

### 6.3 Conversion Landing Page (`app/routes/$conversionType.tsx`)
- SSR loader: look up conversion by slug, 404 if invalid
- State machine: idle -> uploaded -> queued/converting -> completed (or payment_required/failed)
- Layout per spec wireframe: H1, FileUploader, ConversionProgress/PaymentPrompt/DownloadButton, SEO content, FAQ, related conversions
- Handle Stripe return via URL params (fileId + session_id)
- Format-specific gradient background

### 6.4 404 Handling
- Invalid slugs return proper 404
- Known-but-unsupported formats show "Coming soon" with `noindex`

---

## Phase 7: Blog System

### 7.1 Blog Content (`content/blog/*.md`)
- 4 initial posts with frontmatter: title, description, date, slug, relatedConversion

### 7.2 Blog Post Route (`app/routes/blog/$slug.tsx`)
- Loader reads markdown, parses with gray-matter + marked
- Tailwind prose styling, related conversion CTA

### 7.3 Blog Index (`app/routes/blog/index.tsx`)
- Card grid of all posts from content/blog/

---

## Phase 8: Cleanup, Security, SEO Files

### 8.1 File Cleanup (`app/lib/cleanup.ts`) — **new file**
- `cleanupExpiredFiles()` — delete expired files, update status
- Never delete pending_payment/queued/converting jobs
- Run on startup for stale files from previous runs

### 8.2 Cron Scheduler
- Use `node-cron` to run cleanup every 15 minutes within Node process
- Also register `SIGTERM` handler for graceful shutdown cleanup

### 8.3 Security Headers (`Caddyfile`)
- HSTS, X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy
- Request body size limit: 11MB

### 8.4 robots.txt + sitemap.xml
- Static `public/robots.txt` pointing to sitemap
- Generated `sitemap.xml` listing all conversion pages + blog posts

### 8.5 Env Validation (`app/lib/env.ts`) — **new file**
- Validate STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET at startup

---

## Phase 9: Testing & QA

### 9.1 Fixture files in `test/fixtures/`
- Per format pair: simple text, headings/lists, tables, images (where relevant), corrupted sample

### 9.2 E2E conversion testing — all 7 conversion types with fixtures

### 9.3 Rate limiting + payment flow testing
- 2 free, 3rd triggers payment, Stripe test payment completes conversion
- Failed conversions don't consume quota

### 9.4 UI/UX + mobile testing
- All 6 interaction states, mobile viewports (375px, 768px), Lighthouse Core Web Vitals

### 9.5 Security testing
- Magic byte spoofing, oversized files, path traversal, invalid webhook signatures, expired downloads

---

## Dependency Graph

```
Phase 1 (Foundation)
  |
  v
Phase 2 (Converters)
  |
  v
Phase 3 (API Routes) -----> Phase 4 (Payments)
  |                              |
  |   Phase 5 (UI Components) <--+  (can parallel with Phase 4)
  |          |
  |          v
  |     Phase 6 (Pages)
  |          |
  |          v
  |     Phase 7 (Blog)
  |
  +--> Phase 8 (Cleanup/Security)  (can start after Phase 3)
                |
                v
           Phase 9 (Testing)  (requires all phases)
```

## Key Files to Modify/Create

| File | Action | Phase |
|------|--------|-------|
| `package.json` | Modify (add deps) | 1 |
| `app/lib/conversions.ts` | Implement | 1 |
| `app/lib/file-validation.ts` | Implement | 1 |
| `app/lib/rate-limit.ts` | Implement | 1 |
| `app/lib/queue.ts` | Implement | 1 |
| `app/lib/converters/index.ts` | Implement | 2 |
| `app/lib/converters/pandoc.ts` | Implement | 2 |
| `app/lib/converters/djvulibre.ts` | Implement | 2 |
| `app/lib/converters/calibre.ts` | Implement | 2 |
| `app/lib/converters/weasyprint.ts` | Implement | 2 |
| `app/lib/converters/pdflatex.ts` | **Create** | 2 |
| `app/lib/converters/libreoffice.ts` | Implement | 2 |
| `app/server/entry.ts` | **Create** | 3 |
| `app/server/api/upload.ts` | Implement | 3 |
| `app/server/api/convert.ts` | Implement | 3 |
| `app/server/api/conversion-status.ts` | Implement | 3 |
| `app/server/api/download.ts` | Implement | 3 |
| `app/lib/stripe.ts` | Implement | 4 |
| `app/server/api/create-checkout.ts` | Implement | 4 |
| `app/server/api/webhook/stripe.ts` | Implement | 4 |
| `app/styles/globals.css` | Implement | 5 |
| `app/components/*.tsx` (9 files) | Implement | 5 |
| `app/routes/__root.tsx` | Modify | 6 |
| `app/routes/index.tsx` | Implement | 6 |
| `app/routes/$conversionType.tsx` | Implement | 6 |
| `app/routes/blog/$slug.tsx` | **Create** | 7 |
| `app/routes/blog/index.tsx` | **Create** | 7 |
| `content/blog/*.md` (4 files) | **Create** | 7 |
| `app/lib/cleanup.ts` | **Create** | 8 |
| `app/lib/env.ts` | **Create** | 8 |
| `Caddyfile` | Modify | 8 |
| `public/robots.txt` | **Create** | 8 |
| `vite.config.ts` | Modify | 3 |

## Verification

1. **Per-phase:** Each phase has its own verification steps (see details above)
2. **Full E2E:** After all phases, run `docker compose up --build` and test the complete flow: visit `/docx-to-markdown`, upload a file, watch conversion, download result, exhaust free quota, pay via Stripe test mode, verify paid conversion works
3. **SEO check:** Validate SSR output with `curl`, check structured data with Google's Rich Results Test, run Lighthouse
