# WittyFlip Reach Expansion Specification

## Overview

WittyFlip currently serves 7 niche document conversions and a small English blog. This expansion grows reach while staying close to the product's original strengths: privacy, fast execution, and conversion pages that can realistically rank. The scope is intentionally narrower than a general-purpose converter rollout.

This phase focuses on:

- high-demand, browser-friendly image conversions
- low-competition developer and data conversions
- selective document and ebook adjacencies that reuse the current server-side stack
- English-only SEO improvements: landing pages, hub pages, homepage updates, and cluster-based blog content

This phase adds 34 new conversion pairs and grows total supported conversions from 7 to 41. Based on the research set, the new pairs cover about 8,799,000 known monthly searches, plus additional long-tail demand from `pdf-to-markdown`. Combined with the current catalog (~150K/mo), WittyFlip reaches about 8.95M known monthly searches without expanding into audio/video or multilingual SEO.

Audio/video conversions and i18n are explicitly out of scope for this phase.

## Goals & Success Criteria

### Primary Objectives

- Increase known addressable keyword volume from ~150K/month to ~8.95M/month without moving into audio/video or i18n
- Win early rankings on modern image formats and low-competition developer/data queries
- Keep the product thesis intact: fast, trustworthy conversions with a clear privacy story
- Add 34 working conversion pages and 4 category hub pages in English
- Expand English content to 8-12 cluster-driven posts that support the strongest conversion pages
- Reuse the current server-side stack where it is already strong, and use client-side processing only where it improves UX and privacy

### Success Metrics

- Organic search traffic: 5x increase within 6 months of full rollout
- New page indexing: all working conversion pages indexed within 6 weeks
- Client-side conversion completion rate: >97% for core image and developer/data tools
- Free-tier failure handling: failed client-side conversions do not consume quota
- Bounce rate on top new landing pages: <60%
- New-conversion traffic mix: image + developer/data pages account for at least 40% of total organic traffic within 6 months
- Content contribution: blog/support content drives at least 10% of organic traffic within 6 months

---

## Expansion Strategy

### What this phase is optimizing for

This expansion is not trying to out-breadth Convertio or CloudConvert. It is trying to maximize winnable search visibility while keeping implementation risk low.

The prioritization rule for new conversions is:

1. Search demand
2. Competition and ranking difficulty
3. Brand fit with WittyFlip's document/developer positioning
4. Technical complexity and QA burden
5. Monetization fit with the current freemium + Stripe model

That leads to four deliberate choices:

- Ship image conversions first because they unlock the largest new traffic pool and support a strong privacy story
- Move developer/data tools ahead of broad document adjacencies because they are lower competition and closer to WittyFlip's current audience
- Add selective document/ebook adjacencies only where the current server-side stack can support them cleanly
- Do not expand into audio/video or multilingual SEO in this phase

### Why audio/video is excluded

- Audio/video pushes WittyFlip into the most crowded head terms in the market
- Browser-side FFmpeg adds major performance and compatibility complexity
- COOP/COEP requirements create avoidable integration risk for Stripe and ads
- The resulting UX is slower and less aligned with the product's "fast and simple" promise

### Why i18n is excluded

- Multilingual SEO multiplies every page, FAQ, metadata field, and QA path
- WittyFlip should prove the English template and cluster strategy before multiplying content
- English-only execution keeps editorial quality higher and rollout faster

---

## New Conversion Types

### Category: Image Conversions

These are the primary traffic engine for the expansion. All image conversions run client-side so files stay in the browser.

#### Core image set (Phase 9)

| Slug | Source -> Target | Est. Monthly Searches | Processing Method | Library/API |
|------|------------------|----------------------:|-------------------|-------------|
| `webp-to-png` | WebP -> PNG | 1,830,000 | Client-side | Canvas API (default) / libwebp WASM (enhanced quality) |
| `webp-to-jpg` | WebP -> JPG | 1,800,000 | Client-side | Canvas API (default) / libwebp WASM (enhanced quality) |
| `png-to-webp` | PNG -> WebP | 990,000 | Client-side | Canvas API (default) / libwebp WASM (enhanced quality) |
| `avif-to-jpg` | AVIF -> JPG | 670,000 | Client-side | Canvas API (native decode) |
| `svg-to-png` | SVG -> PNG | 500,000 | Client-side | Canvas API |
| `png-to-jpg` | PNG -> JPG | 400,000 | Client-side | Canvas API |
| `jpg-to-png` | JPG -> PNG | 325,000 | Client-side | Canvas API |
| `jpg-to-webp` | JPG -> WebP | 200,000 | Client-side | Canvas API (default) / libwebp WASM (enhanced quality) |
| `avif-to-png` | AVIF -> PNG | 130,000 | Client-side | Canvas API (native decode) |

#### Advanced image set (Phase 11)

| Slug | Source -> Target | Est. Monthly Searches | Processing Method | Library/API |
|------|------------------|----------------------:|-------------------|-------------|
| `heic-to-jpg` | HEIC -> JPG | 1,000,000 | Client-side | libheif WASM |
| `heic-to-png` | HEIC -> PNG | 150,000 | Client-side | libheif WASM |
| `tiff-to-jpg` | TIFF -> JPG | 115,000 | Client-side | UTIF.js |
| `bmp-to-png` | BMP -> PNG | 55,000 | Client-side | Canvas API |
| `gif-to-png` | GIF -> PNG | 45,000 | Client-side | Canvas API |
| `png-to-ico` | PNG -> ICO | 40,000 | Client-side | Custom JS |

Notes:
- `webp-to-gif` is deferred because the volume is smaller and the encoding QA burden is much higher
- `gif-to-png` exports the first frame of animated GIFs unless a richer frame-selection UX is added later

#### Canvas API vs libwebp WASM dual-mode design

Four WebP-involving conversions (`webp-to-png`, `webp-to-jpg`, `png-to-webp`, `jpg-to-webp`) support two processing modes:

**Standard mode (Canvas API):**
- Zero additional bundle cost, uses the browser's native WebP codec
- Suitable for the vast majority of conversions
- Known limitations: typically drops EXIF and ICC metadata during the Canvas round-trip, premultiplied alpha can cause subtle color shifts on semi-transparent pixels, browser JPEG/WebP quality mapping is not identical across engines, and there is no direct control over PNG compression level or WebP lossless / near-lossless settings

**Enhanced quality mode (libwebp WASM, lazy-loaded):**
- Loaded on demand when the user enables the option (~200-400KB gzipped)
- More predictable WebP decode/encode behavior than the default Canvas path
- Better control over encoding parameters: quality, lossless / near-lossless, method, and alpha quality
- Better handling of transparency edges for WebP <-> PNG workflows
- Can preserve ICC color profiles when the selected conversion path supports them
- Does not preserve EXIF/XMP metadata by default; any metadata-retention option must stay opt-in with a clear privacy warning

**UX:**
- The page loads in Standard mode by default and does not download WASM until the user opts in
- An expandable "Conversion options" panel below the drop zone offers:
  - **Processing mode** segmented control:
    - `Standard (fast)`
    - `Enhanced quality` - "better color, transparency, and WebP encoder control"
  - When Enhanced quality is active, a **quality slider** appears for lossy targets like JPG and WebP
  - **Preserve color profile** checkbox appears when supported by the active path
  - **Keep original metadata** is an advanced option, off by default, and only shown when the conversion path can actually support it; the label must warn that metadata can include device and location information
  - A brief explainer: "Enhanced quality uses a dedicated WebP library for more predictable colors, transparency, and compression settings. First use may take a moment while the converter loads."
- If the WASM bundle fails to load, show a non-blocking fallback message and let the user retry or continue in Standard mode
- The same lazy-load pattern already applies to libheif on HEIC pages

**Implementation:**
- `app/lib/client-converters/canvas-converter.ts` handles the default Canvas path
- `app/lib/client-converters/webp-converter.ts` handles the libwebp WASM path
- The converter registry selects the active implementation based on the user's processing-mode preference and supported options
- The libwebp path should run in a Web Worker where practical so larger images do not block the main thread
- Both implementations conform to the same `ClientConverter` interface

**Known addressable image search volume in scope: ~8,250,000/month**

### Category: Developer and Data Conversions

These are the ranking wedge for the expansion. They are lower competition than mainstream media terms and fit WittyFlip's existing developer/document audience.

All of these run client-side. File upload and paste input are both supported.

| Slug | Source -> Target | Est. Monthly Searches | Processing Method | Library |
|------|------------------|----------------------:|-------------------|---------|
| `json-to-csv` | JSON -> CSV | 35,000 | Client-side | Papa Parse / custom serializer |
| `xml-to-json` | XML -> JSON | 35,000 | Client-side | DOMParser + custom serializer |
| `json-to-yaml` | JSON -> YAML | 27,000 | Client-side | js-yaml |
| `csv-to-json` | CSV -> JSON | 27,000 | Client-side | Papa Parse |
| `yaml-to-json` | YAML -> JSON | 20,000 | Client-side | js-yaml |
| `markdown-to-html` | Markdown -> HTML | 20,000 | Client-side | markdown-it or marked |
| `html-to-markdown` | HTML -> Markdown | 20,000 | Client-side | Turndown |
| `json-to-xml` | JSON -> XML | 15,000 | Client-side | Custom serializer |
| `xml-to-csv` | XML -> CSV | 12,000 | Client-side | DOMParser + custom serializer |

These pages should not be thin "upload and download" pages. They need paste input, validation feedback, preview, copy-to-clipboard, and downloadable output.

**Known addressable developer/data search volume: ~211,000/month**

### Category: Document and Office Adjacencies

These extend WittyFlip's existing document footprint without chasing the most competitive PDF head terms.

All of these use the existing server-side architecture.

| Slug | Source -> Target | Est. Monthly Searches | Processing Method | Library/Tool |
|------|------------------|----------------------:|-------------------|--------------|
| `pdf-to-text` | PDF -> TXT | 100,000 | Server-side | Poppler (`pdftotext`) |
| `csv-to-excel` | CSV -> XLSX | 60,000 | Server-side | LibreOffice |
| `odt-to-pdf` | ODT -> PDF | 45,000 | Server-side | LibreOffice |
| `excel-to-csv` | XLSX -> CSV | 22,000 | Server-side | LibreOffice |
| `rtf-to-pdf` | RTF -> PDF | 20,000 | Server-side | LibreOffice |
| `pdf-to-markdown` | PDF -> Markdown | Unverified / strategic | Server-side (experimental) | Prototype required |

Notes:
- `pdf-to-markdown` is a strategic brand-fit addition, not a volume-first play
- `pdf-to-markdown` only launches indexed if fixture quality is good enough for real use; otherwise it remains beta and `noindex`

**Known addressable document/office search volume in scope: ~247,000/month, plus `pdf-to-markdown` long-tail demand not included in totals**

### Category: Ebook Conversions

These modernize WittyFlip's ebook coverage while staying close to current user intent.

All of these use the server-side architecture.

| Slug | Source -> Target | Est. Monthly Searches | Processing Method | Library/Tool |
|------|------------------|----------------------:|-------------------|--------------|
| `epub-to-azw3` | EPUB -> AZW3 | 8,000 | Server-side | Calibre |
| `epub-to-pdf` | EPUB -> PDF | 65,000 | Server-side | Calibre |
| `mobi-to-epub` | MOBI -> EPUB | 10,000 | Server-side | Calibre |
| `azw3-to-epub` | AZW3 -> EPUB | 8,000 | Server-side | Calibre |

Keep existing `epub-to-mobi` for legacy support, but do not position it as a growth pillar.

**Known addressable ebook search volume in scope: ~91,000/month**

### Summary

| Category | New Conversions | Known Monthly Searches |
|----------|----------------:|----------------------:|
| Image | 15 | 8,250,000 |
| Developer and Data | 9 | 211,000 |
| Document and Office | 6 | 247,000* |
| Ebook | 4 | 91,000 |
| **Total** | **34** | **8,799,000*** |

`*` `pdf-to-markdown` is intentionally excluded from the numeric totals because the research set does not provide a reliable volume estimate.

Combined with the current 7 conversions (~150K/mo), WittyFlip reaches **~8.95M known monthly searches**, plus additional long-tail demand from `pdf-to-markdown`.

---

## Technical Design

### Architecture: Two execution modes, one product model

The current server-side pipeline remains the default for document and ebook conversions. The new client-side architecture is introduced only for image and developer/data conversions.

#### Client-side conversion flow (new)

Used for:
- all new image conversions
- all new developer/data conversions

```
1. User selects a file or pastes input
2. Client calls POST /api/client-conversion/start
   -> Server validates the requested conversion
   -> Server checks the user's daily quota
   -> If free quota remains:
      - create a client conversion attempt
      - reserve one free slot atomically
      - return { attemptId, token, allowed: true }
   -> If free quota is exhausted:
      - create a client conversion attempt with status=payment_required
      - return { attemptId, allowed: false, requiresPayment: true }
3a. If allowed:
    - browser runs the conversion locally
    - client calls POST /api/client-conversion/complete on success
    - or POST /api/client-conversion/fail on failure
    - download is generated from a Blob or text result in the browser
3b. If payment is required:
    - client calls POST /api/create-checkout with { attemptId }
    - Stripe Checkout completes off-site
    - client polls GET /api/client-conversion/:attemptId/status
    - when payment is confirmed, server returns a fresh token
    - browser runs the conversion locally
```

Files never leave the browser for client-side conversions.

#### Server-side conversion flow (existing + expanded)

Used for:
- current server-side conversions
- new document/office adjacencies
- new ebook conversions

```
POST /api/upload -> POST /api/convert -> Queue -> Convert -> Download
```

This keeps the existing job model, download window, cleanup rules, and Stripe flow for server-side jobs.

### Quota and monetization rules

The product keeps one consistent rule set across both execution modes:

- 2 free successful conversions per IP per day
- failed conversions do not consume quota
- paid conversions bypass the free quota
- Stripe Checkout remains the only payment flow
- client-side conversions still require server authorization before they can start

For client-side conversions specifically:

- reserve a free slot when `/api/client-conversion/start` succeeds
- convert the reservation into a consumed free slot only when `/api/client-conversion/complete` succeeds
- release the reservation when `/api/client-conversion/fail` is called or when the attempt expires
- never burn a free slot for a failed browser-side conversion

### New API endpoints

#### `POST /api/client-conversion/start`

Request:
```typescript
{
  conversionSlug: string
  originalFilename?: string
  fileSizeBytes?: number
  inputMode: "file" | "paste"
}
```

Response (allowed):
```typescript
{
  allowed: true
  attemptId: string
  token: string
  processingMode: "client"
  remainingFreeAfterReservation: number
}
```

Response (payment required):
```typescript
{
  allowed: false
  attemptId: string
  requiresPayment: true
  status: "payment_required"
}
```

Logic:
- validate `conversionSlug` against the client-side registry
- create a `client_conversion_attempts` row
- reserve a free slot atomically if quota is available
- otherwise mark the attempt `payment_required`

#### `GET /api/client-conversion/:attemptId/status`

Response:
```typescript
{
  attemptId: string
  status:
    | "reserved"
    | "payment_required"
    | "pending_payment"
    | "ready"
    | "completed"
    | "failed"
    | "expired"
  token?: string
  paid?: boolean
  expiresAt?: string
}
```

Used for:
- recovery after refresh
- recovery after Stripe redirect
- polling while payment is pending
- telling the client whether it can safely start the in-browser conversion

#### `POST /api/client-conversion/complete`

Request:
```typescript
{
  attemptId: string
  token: string
  outputFilename: string
  outputMimeType: string
  outputFileSizeBytes?: number
  durationMs?: number
}
```

Response:
```typescript
{
  recorded: true
}
```

Logic:
- validate token, attempt status, and expiry
- mark the attempt `completed`
- promote the reserved free slot to a consumed free slot if the attempt was free
- store analytics metadata only; no file is uploaded

#### `POST /api/client-conversion/fail`

Request:
```typescript
{
  attemptId: string
  token: string
  errorCode: string
  errorMessage?: string
}
```

Response:
```typescript
{
  released: true
}
```

Logic:
- mark the attempt `failed`
- release any reserved free slot
- record the failure for analytics and debugging

#### `POST /api/create-checkout` (updated)

The current checkout endpoint should accept either a server-side `fileId` or a client-side `attemptId`:

```typescript
{ fileId: string } | { attemptId: string }
```

This keeps one Stripe integration while supporting both execution modes.

### Data model changes

#### `conversions` table - add category metadata for server-side rows

```sql
ALTER TABLE conversions ADD COLUMN category TEXT NOT NULL DEFAULT 'document';
-- Values: 'document' | 'developer' | 'ebook'
```

Server-side rows continue to live in `conversions`. Client-side work uses a new table instead of trying to force file-less attempts into the upload job schema.

#### `client_conversion_attempts` table - new

```sql
CREATE TABLE client_conversion_attempts (
  id TEXT PRIMARY KEY,
  conversion_type TEXT NOT NULL,
  category TEXT NOT NULL, -- image | developer
  ip_address TEXT NOT NULL,
  input_mode TEXT NOT NULL, -- file | paste
  original_filename TEXT,
  input_size_bytes INTEGER,
  output_size_bytes INTEGER,
  rate_limit_date TEXT,
  was_paid INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'reserved',
  error_code TEXT,
  error_message TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  expires_at TEXT
);
```

Status values:
- `reserved`
- `payment_required`
- `pending_payment`
- `ready`
- `completed`
- `failed`
- `expired`

#### `payments` table - support both work types

Update the payments schema so a payment can reference either a server-side conversion or a client-side attempt.

```sql
ALTER TABLE payments ADD COLUMN conversion_id TEXT;
ALTER TABLE payments ADD COLUMN client_attempt_id TEXT;
```

Migration note:
- existing `file_id` usage should be migrated to `conversion_id`
- application logic must enforce that exactly one of `conversion_id` or `client_attempt_id` is populated per payment row

#### `ConversionType` interface - new fields

```typescript
export interface ConversionType {
  // existing fields...
  category: "document" | "image" | "developer" | "ebook"
  processingMode: "server" | "client"
  clientConverter?: string
  clientConverterEnhanced?: string      // optional WASM alternative for fidelity-sensitive paths
  maxFileSizeMB?: number
  estimatedSearchVolume?: number
  supportsPasteInput?: boolean
  launchPhase?: 9 | 10 | 11 | 12
  indexable?: boolean
}
```

### Client-side converter architecture

Mirror the current server-side registry with a client-side registry for browser-safe tools only.

```typescript
// app/lib/client-converters/types.ts
export interface ClientConversionInput {
  file?: File
  text?: string
  filename?: string
}

export interface ClientConversionResult {
  kind: "binary" | "text"
  blob?: Blob
  text?: string
  filename: string
  mimeType: string
}

export interface ClientConverter {
  convert(
    input: ClientConversionInput,
    onProgress?: (percent: number) => void
  ): Promise<ClientConversionResult>
}
```

Suggested implementation layout:

```
app/lib/client-converters/
├── types.ts
├── index.ts
├── canvas-converter.ts
├── webp-converter.ts        # libwebp WASM high-quality path (lazy-loaded)
├── heif-converter.ts
├── tiff-converter.ts
├── ico-converter.ts
├── json-yaml.ts
├── json-csv.ts
├── xml-json.ts
├── markdown-html.ts
└── svg-png.ts
```

### Client-side loading strategy

This phase intentionally avoids sitewide heavy browser runtimes.

1. Landing pages load without client-side converter bundles in the initial HTML
2. Converter code loads only after the user interacts with the tool
3. HEIC pages lazily load `libheif` only when needed
4. WebP pages lazily load `libwebp` only when the user enables Enhanced quality mode
5. Developer/data libraries stay lightweight and can be bundled per route or lazily imported
6. No sitewide COOP/COEP requirement in this phase

Approximate bundle impact:
- libwebp: ~200-400KB gzipped, loaded only on WebP pages when Enhanced quality mode is enabled
- libheif: ~1.5MB gzipped on HEIC pages only
- js-yaml / Papa Parse / markdown-it / Turndown: tens of KB, not MB-scale
- Canvas-based image conversions: minimal additional weight

### Browser compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Canvas API | Yes | Yes | Yes | Yes |
| WebP decode | Yes | Yes | 16+ | Yes |
| AVIF decode | 85+ | 93+ | 16+ | 85+ |
| SVG to Canvas | Yes | Yes | Yes | Yes |
| libheif WASM | Yes | Yes | 15+ | Yes |
| JS data converters | All modern | All modern | All modern | All modern |

Rules:
- show a clear unsupported-browser message instead of a broken tool
- detect HEIC native support where helpful, but plan for `libheif` as the compatibility layer
- keep the conversion UI usable on mobile for lightweight image/data tools

---

## Programmatic SEO Landing Pages

### URL structure

Keep the flat URL pattern:

- `/$conversionSlug`
- example: `/webp-to-png`

This stays aligned with the current routing model and with the competitor patterns that perform best in search.

After this expansion:
- 34 new conversion pages
- 41 total supported conversion pages

### Indexing rule

Only index pages that meet all of the following:

- working converter exists
- human-reviewed page copy exists
- FAQ and metadata are complete
- output quality is acceptable for real samples
- the page is not marked experimental

This is especially important for `pdf-to-markdown`.

### Landing page template

Every conversion page follows one of two variants.

#### File-based conversion template

Used for image, document, and ebook conversions.

```
[Header + category breadcrumb]

H1: Convert {Source} to {Target}
Subtitle: Free, fast, and private
- "Processed in your browser" for client-side pages
- "Processed on our secure servers" for server-side pages

[Upload / drop zone]

How to convert {Source} to {Target}
1. Select your file
2. Convert it in your browser or on our servers
3. Download the result

About {Source}
About {Target}

FAQ
- 5 to 6 questions

Related conversions
Privacy and security block
Optional trust block:
- files converted this week
- success rate
- launch badge / beta label when appropriate
```

#### Text and structured-data template

Used for developer/data tools.

```
[Header + category breadcrumb]

H1: Convert {Source} to {Target}
Subtitle: Paste text or upload a file. Preview the result before downloading.

[Input tabs: Paste | Upload]
[Options if relevant]
[Convert]
[Output preview + Copy + Download]

How it works
Format notes
FAQ
Related tools
Privacy and security block
```

### SEO requirements per page

Each indexed conversion page needs:

- `seo.title`: target pair + "Online" or "Free" where natural
- `seo.description`: ~150-160 chars, specific to the pair
- `seo.h1`
- `seo.keywords`: 4-6 specific keywords
- `seoContent`: 3-4 useful paragraphs
- `faq`: 5-6 Q&A pairs
- `relatedConversions`: 3-5 slugs
- structured data:
  - `FAQPage`
  - `SoftwareApplication`
  - `BreadcrumbList`
- self-referencing canonical URL
- Open Graph and Twitter metadata

Quality rules:
- no keyword stuffing
- no filler copy repeated across dozens of pages
- AI draft generation is acceptable, but every indexed page must be human-reviewed
- copy should explain real format details and real conversion constraints

---

## Category Hub Pages

### Routes

| Route | Category | Purpose |
|-------|----------|---------|
| `/image-converter` | Image | Main image conversion hub |
| `/developer-tools` | Developer and data | JSON, YAML, XML, Markdown, HTML, and developer-oriented document utilities |
| `/document-converter` | Document and office | PDF, office, spreadsheet, and archival document tools |
| `/ebook-converter` | Ebook | EPUB, MOBI, and AZW3 tools |
| `/privacy` | Trust and privacy | Explains local processing, server processing, retention, and payment clarity |

### Hub page role

Hub pages are primarily for:

- internal linking
- navigation
- cluster authority
- broader conversion intent

They should not be treated as major traffic bets until their standalone keyword demand is validated with direct keyword tools.

### Hub page template

```
H1: Free Online {Category} Converter
Subtitle: Convert between popular {category} formats

Quick convert module
- select source and target
- route to the matching landing page

Top conversions in this category
About this category
Category FAQ
Related categories
Trust and privacy block
```

### Category clustering

Each hub page should be tightly linked to its cluster pages.

Examples:
- `image-converter` -> all WebP, AVIF, HEIC, PNG/JPG, SVG, TIFF, BMP, GIF, and ICO pairs
- `developer-tools` -> JSON/YAML/XML/CSV + Markdown/HTML + `docx-to-markdown` + `markdown-to-pdf` + `html-to-pdf` + `latex-to-pdf`
- `document-converter` -> `pdf-to-text` + `odt-to-pdf` + `rtf-to-pdf` + `csv-to-excel` + `excel-to-csv` + `djvu-to-pdf` + `odt-to-docx`
- `ebook-converter` -> `epub-to-azw3` + `epub-to-pdf` + `mobi-to-epub` + `azw3-to-epub` + `epub-to-mobi`

---

## Homepage Redesign

### Categorized conversion grid

The homepage should move from a flat list of 7 tools to a cluster-first layout.

```
Hero: "Convert Files Without the Guesswork"
Subtitle: "Image, document, ebook, and developer tools. Many conversions run in your browser, and server-side jobs are auto-deleted."

[Search bar]

Image conversions
[Top image tools] [See all]

Developer tools
[Top JSON / Markdown tools] [See all]

Document converters
[Top PDF / office tools] [See all]

Ebook converters
[Top ebook tools] [See all]

Why WittyFlip
- privacy-first processing
- no subscription traps
- clear limits and pricing
- focused catalog instead of a bloated directory
```

Guidelines:
- show the top 4-6 tools per category
- highlight the strongest clusters, not every tool equally
- emphasize trust and clarity over raw page count

### Messaging principles

Homepage copy should be careful not to overpromise.

Good:
- "Many conversions run in your browser"
- "Other conversions run on our secure servers and are deleted automatically"

Avoid:
- "Everything is processed locally"
- "Supports every format"

---

## English SEO Hardening and Blog Expansion

### Content strategy

This phase keeps blog growth focused and English-only.

Target:
- grow from 4 posts to 8-12 posts
- publish around the clusters that show impressions first
- use blog/support content to strengthen conversion clusters, not to create unrelated editorial surface area

### Content clusters

#### Image format guides

| Title | Links To |
|-------|----------|
| WebP vs PNG: Which Should You Use? | `/webp-to-png`, `/png-to-webp` |
| WebP vs JPG: Compression, Quality, and Compatibility | `/webp-to-jpg`, `/jpg-to-webp` |
| HEIC vs JPG: Why iPhone Photos Need Conversion | `/heic-to-jpg`, `/heic-to-png` |
| AVIF vs WebP vs PNG: Modern Image Formats Explained | `/avif-to-jpg`, `/avif-to-png`, `/png-to-webp` |

#### Developer and data workflows

| Title | Links To |
|-------|----------|
| JSON vs YAML vs XML: Which Format Fits Which Job? | `/json-to-yaml`, `/xml-to-json`, `/json-to-xml` |
| How to Convert JSON to CSV for Spreadsheets and BI Tools | `/json-to-csv`, `/csv-to-json` |
| Markdown to HTML and Back Again: Clean Content Workflows | `/markdown-to-html`, `/html-to-markdown` |
| DOCX to Markdown for Git-Based Documentation | `/docx-to-markdown` |

#### Trust and safety

| Title | Links To |
|-------|----------|
| Is It Safe to Use Online File Converters? | `/privacy`, homepage |
| How Browser-Based Conversion Protects Your Files | `/image-converter`, `/developer-tools` |
| Free vs Paid File Converters: What You Actually Get | homepage, pricing touchpoints |

#### Document and ebook adjacencies

| Title | Links To |
|-------|----------|
| EPUB vs AZW3: Which Kindle Format Should You Use? | `/epub-to-azw3`, `/azw3-to-epub` |
| How to Convert PDF to Plain Text for Research and AI Workflows | `/pdf-to-text` |
| ODT, RTF, and DOCX: Converting Office Files Without Losing Structure | `/odt-to-docx`, `/odt-to-pdf`, `/rtf-to-pdf` |

### Blog SEO requirements

- all posts live under `/blog/{slug}`
- every post links to 2-4 relevant conversion pages
- every post includes `Article` schema
- blog index groups posts by cluster or topic
- posts are written to support pages that already matter in search

---

## UI/UX Changes

### Client-side flow for image conversions

```
Step 1: Select file
[Drop zone]
"Your file stays in your browser"

[Conversion options] (collapsible, below drop zone)
- Processing mode selector on WebP pages only:
  - Standard (fast, default)
  - Enhanced quality (loads extra library on first use)
- Quality slider (visible when Enhanced quality is on and target is lossy)
- Preserve color profile (shown only when supported)
- Keep original metadata (advanced, off by default, only shown when support is real, with a privacy warning)

Step 2: Convert locally
[Progress indicator]
- for HEIC: show "Preparing converter..." while libheif loads
- for WebP Enhanced quality: show "Loading enhanced converter..." on first use
- if Enhanced quality fails to load: show "Enhanced quality couldn't load. Retry or continue in Standard mode."

Step 3: Download result
[Download button]
"Convert another file"
```

Key behaviors:
- no upload progress for client-side pages
- result is immediate from memory once conversion finishes
- warn users that closing the tab discards the result
- keep the number of steps visibly low
- processing-mode preference can persist in `localStorage`, but metadata-related options should reset to privacy-safe defaults
- the options panel stays collapsed by default to keep the UI clean for casual users
- Standard mode remains the primary path; Enhanced quality is an opt-in upgrade for fidelity-sensitive cases

### Client-side flow for developer/data tools

```
Input mode: Paste | Upload

[Input editor or file picker]
[Convert]

Output:
- preview
- copy
- download
```

Key behaviors:
- preview is the primary value, not just file download
- surface validation errors clearly
- keep actions obvious: Convert, Copy, Download, Reset

### Server-side flow for document and ebook conversions

Keep the current upload -> convert -> download UX for server-side tools. Reuse the existing job/status pages where possible.

### Privacy badge component

Client-side pages:

```
Privacy-first conversion
Your file or text is processed in your browser. Nothing is uploaded during conversion.
```

Server-side pages:

```
Secure conversion
Files are encrypted in transit and automatically deleted after the retention window.
```

### Responsive considerations

- image and developer/data tools must work well on mobile
- editor/preview layouts collapse into a single column on smaller screens
- hub pages use card grids on desktop and stacked lists on mobile
- HEIC pages should be tested on mobile Safari specifically

---

## Edge Cases and Error Handling

### Client-side conversions

| Scenario | Handling |
|----------|----------|
| Browser lacks needed API | Show clear unsupported-browser message and keep Standard mode available where possible |
| HEIC library fails to load | Retry once, then show an actionable error |
| `libwebp` Enhanced quality fails to load | Show a non-blocking error, offer retry, and keep Standard mode available |
| Invalid JSON/XML/YAML input | Show field-level parse error, not a generic failure |
| SVG references external assets | Warn that unsupported external references may not render |
| Animated GIF uploaded to `gif-to-png` | Export first frame and explain the behavior |
| User closes tab during a reserved attempt | Reservation expires and the slot is released automatically |
| User refreshes after Stripe redirect | `GET /api/client-conversion/:attemptId/status` restores the flow |
| Client-side conversion fails | Call `/api/client-conversion/fail` and release the reserved slot |

### Server-side conversions

Use the current server-side handling from `spec/SPEC.md` for:

- upload validation
- queueing
- timeout handling
- Stripe webhook verification
- cleanup and expiry
- rate-limit release on failed jobs

### Rate limiting rules for client-side attempts

| Rule | Behavior |
|------|----------|
| Free slot reservation | Happens at `start` |
| Free slot consumption | Happens only at `complete` |
| Failed conversion | Releases the reservation |
| Stale attempt | Expires and releases the reservation |
| Paid attempt | Never touches the free quota |

---

## Quality Gates

No new conversion page should launch without the following:

- real fixture samples for the conversion pair
- at least one failure-path test
- reviewed output quality for common cases
- reviewed landing-page copy
- reviewed FAQ and metadata
- browser QA for client-side tools on current Chrome, Firefox, Safari, and Edge where applicable

Special rules:
- `pdf-to-markdown` must stay `noindex` until output quality is consistently useful
- HEIC pages require dedicated QA on Safari and one Chromium browser
- developer/data tools must validate paste-input flows, not just file upload flows
- WebP pages must be QA'd in both Standard and Enhanced quality modes, including transparency edges, color-profile handling, and WASM fallback behavior

---

## Implementation Phases

### Phase 9: Core image foundation (Priority: Highest)

Scope:
- client-side converter registry and UI
- core image conversions
- privacy messaging
- hub and homepage updates

1. Build `app/lib/client-converters/` registry and shared interfaces
2. Implement Canvas-based image converters for:
   - `webp-to-png`
   - `webp-to-jpg`
   - `png-to-webp`
   - `avif-to-jpg`
   - `avif-to-png`
   - `svg-to-png`
   - `png-to-jpg`
   - `jpg-to-png`
   - `jpg-to-webp`
3. Implement the lazy-loaded `libwebp` Enhanced quality path for `webp-to-png`, `webp-to-jpg`, `png-to-webp`, and `jpg-to-webp`, including controls, fallbacks, and privacy-safe metadata defaults
4. Build `POST /api/client-conversion/start`
5. Build `GET /api/client-conversion/:attemptId/status`
6. Build `POST /api/client-conversion/complete`
7. Build `POST /api/client-conversion/fail`
8. Add `client_conversion_attempts` schema and payment-linking updates
9. Create `image-converter` hub page
10. Redesign the homepage around image, developer, document, and ebook clusters
11. Add `/privacy`
12. Update sitemap and internal linking
13. Add reviewed SEO content for Phase 9 pages

### Phase 10: Developer and data tools (Priority: High)

Scope:
- low-competition, high-fit tools
- paste/upload UX
- preview/copy/download flows

1. Implement JSON <-> YAML converters
2. Implement JSON/XML/CSV converters
3. Implement Markdown <-> HTML converters
4. Add paste input, preview, copy, download, and sample-data UX
5. Add 9 developer/data conversion entries to the registry
6. Create `developer-tools` hub page
7. Update homepage cluster cards and related links
8. Add reviewed SEO content for Phase 10 pages

### Phase 11: Advanced image tools and ebook modernization (Priority: High)

Scope:
- HEIC and other higher-QA image tools
- modern ebook additions

1. Implement `heic-to-jpg` and `heic-to-png` with lazy-loaded `libheif`
2. Implement `tiff-to-jpg`, `bmp-to-png`, `gif-to-png`, and `png-to-ico`
3. Add `epub-to-azw3`
4. Add `epub-to-pdf`, `mobi-to-epub`, and `azw3-to-epub`
5. Create or update `ebook-converter` hub page
6. Add reviewed SEO content for Phase 11 pages
7. Run extended browser QA on HEIC pages

### Phase 12: Selective document and office adjacencies (Priority: Medium)

Scope:
- server-side additions that reuse the current stack
- no chase into ultra-competitive PDF head terms

1. Add `pdf-to-text` via Poppler
2. Add `odt-to-pdf` and `rtf-to-pdf` via LibreOffice
3. Add `csv-to-excel` and `excel-to-csv` via LibreOffice
4. Prototype `pdf-to-markdown`
5. Keep `pdf-to-markdown` `noindex` until quality gates are met
6. Update `document-converter` hub page
7. Add reviewed SEO content for Phase 12 pages

### Phase 13: English SEO hardening (Priority: Medium)

Scope:
- content and internal-link quality, not more platform surface area

1. Publish 8-12 English blog/support posts around winning clusters
2. Improve internal linking between cluster pages, hubs, and blog content
3. Add trust blocks and usage metrics where real data exists
4. Refresh titles, descriptions, FAQs, and related-link modules based on early Search Console data
5. Expand only the clusters showing traction; do not ship low-quality filler pages

---

## Open Questions and Risks

### Technical risks

1. **HEIC compatibility and quality**  
   `libheif` is much lighter than browser-side FFmpeg, but it still needs careful QA across browsers and devices.

2. **Client-side quality variance**  
   Standard Canvas mode and Enhanced libwebp mode can produce slightly different outputs. The product should frame Standard as fast/default and Enhanced as the fidelity-focused path.

3. **Metadata and privacy handling**  
   ICC preservation can improve color accuracy, but EXIF/XMP retention can leak device or location data. Any metadata-retention option must remain explicit and off by default.

4. **Reservation cleanup**  
   Client-side attempts need robust expiry handling so abandoned tabs do not hold free-slot reservations indefinitely.

5. **`pdf-to-markdown` quality**  
   This is strategically attractive but technically messy. It should not be treated like a normal auto-generated landing page until fixture results are strong.

### Business risks

1. **Image competition is still real**  
   WebP and HEIC terms are large but competitive. WittyFlip should expect gradual gains, not instant rankings.

2. **Thin-page risk**  
   If new pages are published with generic AI copy, they may fail to rank despite good keyword selection.

3. **Pricing fit on near-zero-cost tools**  
   Some client-side tools cost almost nothing to run. The current 2-free/day + $0.49 model may need tuning later, but this phase keeps the existing rules for simplicity.

### Open decisions

1. **`pdf-to-markdown` launch mode**  
   Recommendation: build it in Phase 12, keep it `noindex` until quality is validated, then decide whether it deserves full indexation.

2. **Client-side free-tier generosity**  
   Recommendation: keep the global 2/day rule for this phase, then revisit after observing image and developer/data usage patterns.

3. **Social proof placement**  
   Recommendation: add real usage metrics only after enough trustworthy data exists; do not fabricate counters at launch.

---

## Out of Scope

- Audio conversions
- Video conversions
- FFmpeg.wasm
- COOP/COEP rollout
- Internationalization (i18n)
- Blog translation
- Batch conversion
- User accounts / login
- Developer API
- Affiliate program
- Server-side fallback for client-side image/data tools in this phase
- Mainstream PDF head-term expansion such as `pdf-to-word`, `word-to-pdf`, or `jpg-to-pdf`
- Low-quality or `coming soon` pages indexed for SEO

This phase succeeds if WittyFlip grows into a larger English-only search footprint while still feeling focused, fast, privacy-aware, and clearly differentiated from generic conversion directories.
