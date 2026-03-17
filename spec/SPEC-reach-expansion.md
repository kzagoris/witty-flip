# WittyFlip Reach Expansion Specification

## Overview

WittyFlip currently serves 7 niche document conversions targeting developer/academic audiences. This expansion dramatically increases the site's addressable search traffic by adding high-volume image, audio, video, and developer data format conversions — targeting an additional ~15M+ monthly searches globally. The expansion introduces client-side processing (browser-based conversion) for image and developer formats, a token-gated rate-limiting system, programmatic SEO landing pages at scale, category hub pages, internationalization (3 languages), and a 15–20 post blog content strategy.

## Goals & Success Criteria

### Primary Objectives

- Increase addressable keyword volume from ~150K/month (current 7 niche conversions) to ~15M+/month
- Capture traffic from high-growth modern image formats (WebP, HEIC, AVIF) where competition is lower than legacy formats
- Enable client-side processing for image and developer conversions (privacy differentiator + zero server load)
- Launch programmatic SEO landing pages for 30+ new conversion pairs
- Expand to 3 non-English markets (Spanish, Portuguese, German) for ~60% potential traffic increase
- Grow blog to 15–20 posts targeting informational keywords that feed into conversion intent

### Success Metrics

- Organic search traffic: 10x increase within 6 months of launch
- New conversion page indexing: all pages indexed within 4 weeks
- Client-side conversion completion rate: >95% (no upload failures, browser compatibility)
- Bounce rate on new landing pages: <60% (competitive benchmark)
- Blog traffic: 15% of total organic traffic from informational queries within 6 months
- i18n traffic: measurable organic traffic from ES/PT/DE markets within 3 months of translation launch

---

## New Conversion Types

### Category: Image Conversions

These target the highest-volume keywords in the conversion market. All use client-side processing via Canvas API, WASM libraries, or the browser's native decoding capabilities.

| Slug | Source → Target | Est. Monthly Searches | Processing Method | Library/API |
|------|----------------|----------------------:|-------------------|-------------|
| `webp-to-png` | WebP → PNG | 1,830,000 | Client-side | Canvas API / libwebp WASM |
| `webp-to-jpg` | WebP → JPG | 1,800,000 | Client-side | Canvas API / libwebp WASM |
| `heic-to-jpg` | HEIC → JPG | 1,000,000 | Client-side | libheif WASM |
| `png-to-webp` | PNG → WebP | 990,000 | Client-side | Canvas API (toBlob) |
| `avif-to-jpg` | AVIF → JPG | 670,000 | Client-side | Canvas API (native decode) |
| `svg-to-png` | SVG → PNG | 500,000 | Client-side | Canvas API (drawImage) |
| `png-to-jpg` | PNG → JPG | 400,000 | Client-side | Canvas API |
| `jpg-to-png` | JPG → PNG | 325,000 | Client-side | Canvas API |
| `jpg-to-webp` | JPG → WebP | 200,000 | Client-side | Canvas API (toBlob) |
| `heic-to-png` | HEIC → PNG | 150,000 | Client-side | libheif WASM |
| `avif-to-png` | AVIF → PNG | 130,000 | Client-side | Canvas API (native decode) |
| `tiff-to-jpg` | TIFF → JPG | 115,000 | Client-side | UTIF.js WASM |
| `bmp-to-png` | BMP → PNG | 55,000 | Client-side | Canvas API |
| `gif-to-png` | GIF → PNG | 45,000 | Client-side | Canvas API |
| `png-to-ico` | PNG → ICO | 40,000 | Client-side | Custom JS (ICO binary format) |
| `webp-to-gif` | WebP → GIF | 20,000 | Client-side | Canvas API + GIF.js |

**Total addressable image search volume: ~8,270,000/month**

### Category: Audio Conversions

Audio conversions require FFmpeg. Using FFmpeg.wasm for client-side processing (slower than native, but avoids server load and maintains privacy story).

| Slug | Source → Target | Est. Monthly Searches | Processing Method | Library |
|------|----------------|----------------------:|-------------------|---------|
| `mp4-to-mp3` | MP4 → MP3 | 1,450,000 | Client-side | FFmpeg.wasm |
| `wav-to-mp3` | WAV → MP3 | 250,000 | Client-side | FFmpeg.wasm |
| `mp3-to-wav` | MP3 → WAV | 180,000 | Client-side | FFmpeg.wasm |
| `flac-to-mp3` | FLAC → MP3 | 150,000 | Client-side | FFmpeg.wasm |
| `m4a-to-mp3` | M4A → MP3 | 150,000 | Client-side | FFmpeg.wasm |
| `ogg-to-mp3` | OGG → MP3 | 60,000 | Client-side | FFmpeg.wasm |
| `opus-to-mp3` | Opus → MP3 | 18,000 | Client-side | FFmpeg.wasm |

**Total addressable audio search volume: ~2,258,000/month**

### Category: Video Conversions

Video conversions are the heaviest workload. FFmpeg.wasm handles these client-side, though large files (>100MB) will be noticeably slower than native. A progress indicator is essential.

| Slug | Source → Target | Est. Monthly Searches | Processing Method | Library |
|------|----------------|----------------------:|-------------------|---------|
| `mov-to-mp4` | MOV → MP4 | 800,000 | Client-side | FFmpeg.wasm |
| `avi-to-mp4` | AVI → MP4 | 300,000 | Client-side | FFmpeg.wasm |
| `mkv-to-mp4` | MKV → MP4 | 300,000 | Client-side | FFmpeg.wasm |
| `webm-to-mp4` | WebM → MP4 | 225,000 | Client-side | FFmpeg.wasm |
| `mp4-to-gif` | MP4 → GIF | 150,000 | Client-side | FFmpeg.wasm |
| `gif-to-mp4` | GIF → MP4 | 100,000 | Client-side | FFmpeg.wasm |
| `mp4-to-webm` | MP4 → WebM | 22,000 | Client-side | FFmpeg.wasm |

**Total addressable video search volume: ~1,897,000/month**

### Category: Developer Data Formats

Lightweight client-side conversions using pure JavaScript. Zero external dependencies. Targets technically sophisticated audiences with low competition.

| Slug | Source → Target | Est. Monthly Searches | Processing Method | Library |
|------|----------------|----------------------:|-------------------|---------|
| `json-to-csv` | JSON → CSV | 35,000 | Client-side | Pure JS |
| `xml-to-json` | XML → JSON | 35,000 | Client-side | Pure JS (DOMParser) |
| `json-to-yaml` | JSON → YAML | 27,000 | Client-side | js-yaml |
| `csv-to-json` | CSV → JSON | 27,000 | Client-side | Pure JS (Papa Parse) |
| `yaml-to-json` | YAML → JSON | 20,000 | Client-side | js-yaml |
| `markdown-to-html` | Markdown → HTML | 20,000 | Client-side | marked / markdown-it |
| `html-to-markdown` | HTML → Markdown | 20,000 | Client-side | Turndown |
| `json-to-xml` | JSON → XML | 15,000 | Client-side | Pure JS |
| `xml-to-csv` | XML → CSV | 12,000 | Client-side | Pure JS (DOMParser) |

**Total addressable developer search volume: ~211,000/month**

### Ebook Addition

| Slug | Source → Target | Est. Monthly Searches | Processing Method | Library |
|------|----------------|----------------------:|-------------------|---------|
| `epub-to-azw3` | EPUB → AZW3 | 8,000 | Server-side | Calibre |

Keep existing `epub-to-mobi` (15K/mo searches still active). Add `epub-to-azw3` as the modern Kindle format alternative.

### Summary

| Category | New Conversions | Total Monthly Searches |
|----------|----------------:|----------------------:|
| Image | 16 | 8,270,000 |
| Audio | 7 | 2,258,000 |
| Video | 7 | 1,897,000 |
| Developer | 9 | 211,000 |
| Ebook | 1 | 8,000 |
| **Total** | **40** | **12,644,000** |

Combined with existing 7 conversions (~150K/mo), total addressable volume rises to **~12.8M monthly searches**.

---

## Technical Design

### Architecture: Client-Side Conversion with Token-Gated Rate Limiting

The existing server-side pipeline (upload → convert → download) remains for the original 7 document conversions plus the new `epub-to-azw3`. All new image, audio, video, and developer conversions use a new **client-side processing architecture**.

```
┌─────────────────────────────────────────────────────────────┐
│ Client-Side Conversion Flow                                  │
│                                                              │
│  1. User selects file in browser                             │
│  2. Client calls POST /api/conversion-token                  │
│     → Server checks IP rate limit (2 free/day)               │
│     → Returns { token, allowed: true } or { allowed: false } │
│  3a. If allowed: JS/WASM converts file in-browser            │
│      → Client calls POST /api/conversion-complete            │
│        (records the conversion for analytics, consumes slot) │
│      → Download link generated from Blob URL                 │
│  3b. If not allowed: UI shows payment prompt                 │
│      → Stripe Checkout → on success, server issues token     │
│      → Client-side conversion proceeds                       │
│                                                              │
│  Files NEVER leave the user's browser.                       │
└─────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────┐
│ Server-Side Conversion Flow (existing, unchanged)            │
│                                                              │
│  POST /api/upload → POST /api/convert → Queue → Convert      │
│  → Download (1hr window) → Cleanup                           │
│                                                              │
│  Used for: DOCX→MD, MD→PDF, HTML→PDF, DJVU→PDF,            │
│            EPUB→MOBI, EPUB→AZW3, ODT→DOCX, LaTeX→PDF       │
└─────────────────────────────────────────────────────────────┘
```

### New API Endpoints

#### `POST /api/conversion-token`

Request:
```typescript
{
  conversionSlug: string  // e.g., "webp-to-png"
}
```

Response (allowed):
```typescript
{
  allowed: true,
  token: string,          // short-lived JWT or HMAC token (5-min expiry)
  remainingFree: number   // remaining free conversions today
}
```

Response (rate-limited):
```typescript
{
  allowed: false,
  remainingFree: 0,
  requiresPayment: true
}
```

Logic:
- Check IP against `rate_limits` table (same as existing rate-limit logic)
- If within free quota: generate a signed token (HMAC with server secret + timestamp + conversion slug)
- If exceeded: return 402 with payment prompt
- The token is verified client-side only for UX purposes — the real enforcement is that `POST /api/conversion-complete` validates the token before recording the conversion

#### `POST /api/conversion-complete`

Request:
```typescript
{
  token: string,          // from /api/conversion-token
  conversionSlug: string,
  sourceFormat: string,
  targetFormat: string,
  fileSizeBytes: number   // for analytics
}
```

Response:
```typescript
{
  recorded: true
}
```

Logic:
- Validate token signature and expiry
- Insert row into `conversions` table (status: `completed`, no file paths since client-side)
- Consume rate-limit slot
- Used for analytics and metrics only — the actual file was never on the server

### Data Model Changes

#### `conversions` table — new columns

```sql
ALTER TABLE conversions ADD COLUMN processing_mode TEXT NOT NULL DEFAULT 'server';
-- Values: 'server' | 'client'

ALTER TABLE conversions ADD COLUMN category TEXT NOT NULL DEFAULT 'document';
-- Values: 'document' | 'image' | 'audio' | 'video' | 'developer' | 'ebook'
```

#### `ConversionType` interface — new fields

```typescript
export interface ConversionType {
  // ... existing fields ...
  category: 'document' | 'image' | 'audio' | 'video' | 'developer' | 'ebook'
  processingMode: 'server' | 'client'
  clientConverter?: string         // e.g., 'canvas', 'ffmpeg-wasm', 'js-yaml', 'libheif-wasm'
  maxFileSizeMB?: number           // override default 10MB for client-side (e.g., 50MB for video)
  estimatedSearchVolume?: number   // for sorting by popularity
}
```

### Client-Side Converter Architecture

Mirror the server-side converter registry pattern. Each client-side converter implements a common interface:

```typescript
// app/lib/client-converters/types.ts
export interface ClientConverter {
  convert(
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<ConversionResult>
}

export interface ConversionResult {
  blob: Blob
  filename: string
  mimeType: string
}
```

Converter implementations:

```
app/lib/client-converters/
├── types.ts              # ClientConverter interface
├── index.ts              # Registry: slug → converter
├── canvas-converter.ts   # Image conversions via Canvas API
├── heif-converter.ts     # HEIC → JPG/PNG via libheif WASM
├── tiff-converter.ts     # TIFF → JPG via UTIF.js
├── ico-converter.ts      # PNG → ICO via custom binary writer
├── gif-encoder.ts        # WebP → GIF via GIF.js
├── ffmpeg-converter.ts   # Audio/video via FFmpeg.wasm
├── json-yaml.ts          # JSON ↔ YAML via js-yaml
├── json-csv.ts           # JSON ↔ CSV via Papa Parse
├── xml-json.ts           # XML ↔ JSON via DOMParser
├── markdown-html.ts      # Markdown ↔ HTML via marked/Turndown
└── svg-png.ts            # SVG → PNG via Canvas drawImage
```

### WASM Loading Strategy

WASM modules (libheif, FFmpeg) are large. Load them lazily:

1. **Landing page loads instantly** — no WASM in the initial bundle
2. **WASM loads on file selection** — when user picks a file, start loading the required WASM module
3. **Show progress** — "Preparing converter..." with a progress bar while WASM downloads
4. **Cache aggressively** — WASM files served with `Cache-Control: public, max-age=31536000, immutable`
5. **CDN delivery** — serve WASM from a `/wasm/` path with Caddy compression enabled

Estimated WASM sizes:
- libheif: ~1.5MB gzipped
- FFmpeg.wasm (core): ~25MB gzipped (audio-only subset: ~8MB)
- js-yaml, Papa Parse, marked, Turndown: <50KB each (JS, not WASM)

### FFmpeg.wasm Considerations

FFmpeg.wasm runs in a Web Worker with SharedArrayBuffer. Requirements:
- `Cross-Origin-Opener-Policy: same-origin` header
- `Cross-Origin-Embedder-Policy: require-corp` header
- These headers must be set in Caddy configuration
- Incompatible browsers fall back to a message: "Your browser doesn't support this conversion. Please try Chrome, Firefox, or Edge."

For audio-only conversions, use the smaller `@ffmpeg/ffmpeg` core build (~8MB) without video codecs. Load the full build only for video conversions.

### Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Canvas API (image) | Yes | Yes | Yes | Yes |
| WebP decode | Yes | Yes | 16+ | Yes |
| AVIF decode | 85+ | 93+ | 16+ | 85+ |
| HEIC decode (native) | No | No | Yes | No |
| libheif WASM | Yes | Yes | 15+ | Yes |
| FFmpeg.wasm (SharedArrayBuffer) | 92+ | 79+ | 15.2+ | 92+ |
| js-yaml / Papa Parse | All modern | All modern | All modern | All modern |

For unsupported browsers, show a clear message with the minimum browser version required rather than a broken experience.

---

## Programmatic SEO Landing Pages

### URL Structure

Maintain the existing flat URL pattern: `/$conversionSlug` (e.g., `/webp-to-png`).

No changes to the routing architecture — the existing `/$conversionType` dynamic route handles this. The conversion registry expansion from 7 to 47 entries automatically creates 47 landing pages.

### Landing Page Template

Every conversion landing page follows a consistent SEO-optimized template. The existing template in `$conversionType.tsx` serves as the base, with enhancements:

```
┌──────────────────────────────────────────────────────┐
│ [Header with nav + category breadcrumb]               │
├──────────────────────────────────────────────────────┤
│ H1: Convert {Source} to {Target}                      │
│ Subtitle: Free, fast, and private — processed in      │
│           your browser (or "on our secure servers")    │
│                                                        │
│ ┌────────────────────────────────────────┐            │
│ │  [File Upload / Drop Zone]              │            │
│ │  Drag & drop your .{ext} file here      │            │
│ │  or click to browse                     │            │
│ │                                         │            │
│ │  [For client-side: conversion happens   │            │
│ │   right here, no upload needed]         │            │
│ └────────────────────────────────────────┘            │
│                                                        │
│ ── How to Convert {Source} to {Target} ──             │
│ 1. Select your {source} file                          │
│ 2. The file is converted {in your browser/on server}  │
│ 3. Download your {target} file                        │
│                                                        │
│ ── About {Source} Format ──                           │
│ [Format description paragraph]                        │
│                                                        │
│ ── About {Target} Format ──                           │
│ [Format description paragraph]                        │
│                                                        │
│ ── Frequently Asked Questions ──                      │
│ [5-6 FAQ items in accordion, Schema.org FAQ markup]   │
│                                                        │
│ ── Related Conversions ──                             │
│ [Grid of related conversion cards with internal links]│
│                                                        │
│ ── Privacy & Security ──                              │
│ [Trust signals: "Files processed in your browser" or  │
│  "Files deleted after 1 hour", encryption, no signup] │
├──────────────────────────────────────────────────────┤
│ [Footer]                                              │
└──────────────────────────────────────────────────────┘
```

### SEO Enhancements

1. **Title tag formula**: `Convert {Source} to {Target} Online Free | WittyFlip`
2. **Meta description**: ~155 chars, includes conversion pair, "free", "private", and a differentiator
3. **Schema.org markup**: `FAQPage` structured data for FAQ sections (targets featured snippets)
4. **Schema.org markup**: `WebApplication` structured data for the tool itself
5. **Open Graph / Twitter cards**: Social sharing metadata per page
6. **Canonical URLs**: Self-referencing canonical on each page
7. **Internal linking**: Each page links to 3–5 related conversions + its category hub page
8. **Breadcrumbs**: `Home > {Category} Converter > {Source} to {Target}` with Schema.org `BreadcrumbList`

### SEO Content Generation

For 40 new conversion pages, SEO content (descriptions, FAQ, `seoContent` paragraphs) will be AI-generated and human-reviewed. Each page needs:

- `seo.title`: ~60 chars
- `seo.description`: ~155 chars
- `seo.h1`: conversion pair name
- `seo.keywords`: 4–6 target keywords
- `seoContent`: 3–4 paragraphs of unique content about the conversion
- `faq`: 5–6 Q&A pairs targeting featured snippets
- `relatedConversions`: 3–5 slugs for internal linking

Content should be genuinely useful (not keyword-stuffed) and address real user questions about the format pair. Include format-specific details like "WebP was developed by Google for web optimization" rather than generic filler.

---

## Category Hub Pages

### Routes

| Route | Category | Description |
|-------|----------|-------------|
| `/image-converter` | Image | All image conversion pairs |
| `/video-converter` | Video | All video conversion pairs |
| `/audio-converter` | Audio | All audio conversion pairs |
| `/document-converter` | Document | All document conversion pairs (existing + new) |
| `/developer-tools` | Developer | All developer data format conversions |
| `/ebook-converter` | Ebook | All ebook conversion pairs |

### Hub Page Template

```
┌──────────────────────────────────────────────────────┐
│ H1: Free Online {Category} Converter                  │
│ Subtitle: Convert between {format list} formats       │
│           instantly — free, fast, and private          │
│                                                        │
│ ┌────────────────────────────────────────┐            │
│ │ Quick Convert: [Source ▼] → [Target ▼] │            │
│ │               [Convert Now →]           │            │
│ └────────────────────────────────────────┘            │
│                                                        │
│ ── All {Category} Conversions ──                      │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐                 │
│ │ WebP→PNG│ │ WebP→JPG│ │ HEIC→JPG│  ...             │
│ │ 🔥 Most │ │ Popular │ │         │                   │
│ │ popular │ │         │ │         │                   │
│ └─────────┘ └─────────┘ └─────────┘                  │
│                                                        │
│ ── About {Category} Formats ──                        │
│ [Unique content about the category, format landscape] │
│                                                        │
│ ── FAQ ──                                             │
│ [Category-level FAQ targeting broader keywords]       │
│                                                        │
│ ── Related Categories ──                              │
│ [Links to other category hub pages]                   │
└──────────────────────────────────────────────────────┘
```

### SEO Targeting

Hub pages target category-level keywords with significant volume:
- "image converter online" (~100K/mo)
- "video converter online" (~200K/mo)
- "audio converter online" (~50K/mo)
- "document converter online" (~30K/mo)

These are broader, higher-competition keywords, but the hub pages build internal link equity to individual conversion pages and provide another entry point from search.

---

## Homepage Redesign

### Categorized Conversion Grid

The homepage evolves from a flat grid of 7 conversions to a categorized layout showcasing all 47+ conversions.

```
┌──────────────────────────────────────────────────────┐
│ Hero: "Convert Any File — Free, Fast, Private"        │
│ Subtitle: "Image, video, audio, document, and more.   │
│            Most conversions happen right in your       │
│            browser — your files never leave your       │
│            device."                                    │
│                                                        │
│ [Search bar: "What do you want to convert?"]          │
│                                                        │
│ ── 🖼 Image Conversions ──          [See all →]       │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐          │
│ │WebP│ │WebP│ │HEIC│ │PNG │ │AVIF│ │SVG │           │
│ │→PNG│ │→JPG│ │→JPG│ │→Web│ │→JPG│ │→PNG│           │
│ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘           │
│                                                        │
│ ── 🎬 Video Conversions ──          [See all →]       │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐                         │
│ │MOV │ │AVI │ │MKV │ │WebM│  ...                     │
│ │→MP4│ │→MP4│ │→MP4│ │→MP4│                          │
│ └────┘ └────┘ └────┘ └────┘                          │
│                                                        │
│ ── 🎵 Audio Conversions ──          [See all →]       │
│ ...                                                    │
│                                                        │
│ ── 📄 Document Conversions ──       [See all →]       │
│ ...                                                    │
│                                                        │
│ ── 💻 Developer Tools ──            [See all →]       │
│ ...                                                    │
│                                                        │
│ ── 📚 Ebook Conversions ──          [See all →]       │
│ ...                                                    │
│                                                        │
│ ── Why WittyFlip? ──                                  │
│ • Privacy-first: most conversions in your browser      │
│ • No signup required                                   │
│ • No subscription traps — pay only when you need to   │
│ • 47+ conversion types                                │
└──────────────────────────────────────────────────────┘
```

Each category shows its top 6 conversions (by search volume) on the homepage, with "See all →" linking to the category hub page.

---

## Internationalization (i18n)

### Target Languages

| Language | Code | Market Size | Priority |
|----------|------|-------------|----------|
| Spanish | `es` | Largest non-English search market for conversions | 1 |
| Portuguese | `pt` | Brazil is a huge conversion tool market | 2 |
| German | `de` | High-value European market, strong tech adoption | 3 |

### URL Structure

Use locale-prefixed paths:

```
/webp-to-png              → English (default, no prefix)
/es/webp-to-png           → Spanish
/pt/webp-to-png           → Portuguese
/de/webp-to-png           → German

/image-converter           → English
/es/image-converter        → Spanish
...
```

### Routing Architecture

Add a `/$locale` optional route prefix:

```
app/routes/
├── $conversionType.tsx           # English (existing)
├── $locale/
│   ├── $conversionType.tsx       # Localized conversion pages
│   ├── image-converter.tsx       # Localized hub pages
│   └── blog/
│       └── $slug.tsx             # Localized blog (future)
```

The route loader checks if `$locale` is a valid locale code (es/pt/de). If not, falls through to 404.

### Translation Scope

**Phase 1 — Programmatic pages (translate):**
- Conversion page UI strings (buttons, labels, instructions, how-to steps)
- SEO metadata (title, description, h1, keywords) per conversion per language
- FAQ content per conversion per language
- `seoContent` paragraphs per conversion per language
- Category hub page content
- Homepage content
- Header/footer navigation

**Phase 2 — Blog (defer):**
- Blog posts are English-only initially
- Blog translation is a future phase (higher quality bar needed for editorial content)

### Translation Method

AI-generated translations, human-reviewed. The translation pipeline:

1. Extract all translatable strings into a structured format (JSON locale files)
2. Generate translations using AI (Claude/GPT) for each target language
3. Human review by native speakers (contracted or community)
4. Store translations in locale files: `app/locales/{lang}.json`

### Locale File Structure

```
app/locales/
├── en.json               # English (source of truth)
├── es.json               # Spanish
├── pt.json               # Portuguese
├── de.json               # German
└── conversion-seo/
    ├── en/
    │   ├── webp-to-png.json
    │   └── ...
    ├── es/
    │   ├── webp-to-png.json
    │   └── ...
    └── ...
```

### SEO for i18n

- `hreflang` tags on every page pointing to all language variants
- `<link rel="alternate" hreflang="es" href="https://wittyflip.com/es/webp-to-png" />`
- XML sitemap includes all language variants
- `x-default` hreflang points to English version

---

## Blog Expansion

### Content Strategy

Expand from 4 posts to 15–20 posts targeting informational keywords that feed into conversion intent. Posts are organized into content pillars:

### Content Pillar 1: Format Comparison Guides (5–6 posts)

These target "X vs Y" search queries and funnel readers to conversion pages.

| Title | Target Keywords | Links To |
|-------|----------------|----------|
| WebP vs PNG: Which Image Format Should You Use? | webp vs png, webp or png | /webp-to-png, /png-to-webp |
| WebP vs JPG: A Complete Comparison for 2026 | webp vs jpg, webp or jpeg | /webp-to-jpg, /jpg-to-webp |
| HEIC vs JPG: Understanding Apple's Image Format | heic vs jpg, what is heic | /heic-to-jpg |
| AVIF vs WebP vs PNG: The Modern Image Format Battle | avif vs webp, avif vs png | /avif-to-jpg, /avif-to-png |
| MP4 vs WebM vs AVI: Video Format Guide | mp4 vs webm, mp4 vs avi | /avi-to-mp4, /webm-to-mp4 |
| JSON vs YAML vs XML: Data Format Comparison for Developers | json vs yaml, json vs xml | /json-to-yaml, /xml-to-json |

### Content Pillar 2: How-To / Workflow Guides (5–6 posts)

Practical tutorials targeting long-tail "how to convert X" queries.

| Title | Target Keywords | Links To |
|-------|----------------|----------|
| How to Convert HEIC Photos to JPG on Any Device | how to convert heic to jpg | /heic-to-jpg |
| How to Convert Word Documents to Markdown for GitHub | docx to markdown github | /docx-to-markdown |
| How to Convert Videos to MP4 Without Losing Quality | convert video to mp4, best settings | /mov-to-mp4, /avi-to-mp4 |
| How to Convert Audio Files to MP3: The Complete Guide | convert to mp3, audio converter | /wav-to-mp3, /flac-to-mp3 |
| How to Work with JSON, YAML, and CSV Conversions | convert json to csv, json to yaml | /json-to-csv, /json-to-yaml |
| How to Convert DjVu Files to PDF (Academic Documents) | djvu to pdf, how to open djvu | /djvu-to-pdf |

### Content Pillar 3: Trust & Safety Content (2–3 posts)

Targets privacy-concern search traffic — the competitive analysis's #1 identified user pain point.

| Title | Target Keywords | Links To |
|-------|----------------|----------|
| Is It Safe to Use Online File Converters? (2026 Guide) | is it safe to convert files online, safe file converter | Homepage |
| How WittyFlip Protects Your Privacy: Browser-Based Conversion Explained | private file converter, no upload converter | Homepage, /image-converter |
| Free vs Paid File Converters: What You're Really Paying For | free file converter, file converter cost | Homepage |

### Content Pillar 4: Technical / Developer Content (2–3 posts)

Targets developer audience, positions WittyFlip as technically credible.

| Title | Target Keywords | Links To |
|-------|----------------|----------|
| Browser-Based File Conversion: How We Built WittyFlip's Client-Side Engine | wasm file conversion, client side conversion | /developer-tools |
| Markdown in 2026: Why Every Developer Needs a Good Converter | markdown tools, markdown converter | /docx-to-markdown, /markdown-to-html |
| Understanding LaTeX Compilation: Online vs Local TeX Distributions | latex online, compile latex online | /latex-to-pdf |

### Blog SEO Requirements

- All posts at `/blog/{slug}` (existing subfolder structure)
- Each post includes internal links to 2–3 relevant conversion pages
- Posts include Schema.org `Article` structured data
- Updated sitemap includes all blog posts
- Blog index page shows posts organized by pillar/category

---

## UI/UX Changes

### Client-Side Conversion Flow

The UX for client-side conversions differs from server-side:

```
┌─────────────────────────────────────────────────────┐
│ Step 1: File Selection                               │
│ [Drag & drop zone]                                   │
│ "Select your .webp file"                             │
│ Note: "Your file stays in your browser"              │
├─────────────────────────────────────────────────────┤
│ Step 2: Converting (client-side)                     │
│ [Progress bar: "Converting... 67%"]                  │
│ "Processing in your browser — file never uploaded"   │
│                                                      │
│ For FFmpeg.wasm (first use):                         │
│ [Progress bar: "Loading converter... 3.2MB/8MB"]     │
│ then                                                 │
│ [Progress bar: "Converting... 67%"]                  │
├─────────────────────────────────────────────────────┤
│ Step 3: Complete                                     │
│ ✓ Conversion complete!                               │
│ [Download result.png] (Blob URL, instant)            │
│ "Convert another file"                               │
│                                                      │
│ No 1-hour expiry — file is in browser memory.        │
│ Closing the tab loses the file.                      │
└─────────────────────────────────────────────────────┘
```

Key UX differences from server-side:
- **No upload progress** — file is read locally, not uploaded
- **"Processed in your browser" badge** — trust signal prominently displayed
- **Instant download** — Blob URL, no server round-trip
- **No expiry timer** — but warn that closing tab loses the file
- **WASM loading indicator** — first-time use for FFmpeg/libheif shows download progress

### Privacy Badge Component

A reusable component shown on all client-side conversion pages:

```
┌─────────────────────────────────────────┐
│ 🔒 Privacy-First Conversion              │
│ Your file is processed entirely in your  │
│ browser. It is never uploaded to our     │
│ servers or any third party.              │
└─────────────────────────────────────────┘
```

For server-side conversions, show the existing trust signals:

```
┌─────────────────────────────────────────┐
│ 🔒 Secure Conversion                     │
│ Files are encrypted in transit and       │
│ automatically deleted after 1 hour.      │
│ No account or email required.            │
└─────────────────────────────────────────┘
```

### Responsive Considerations

- Image/dev format conversions are lightweight — work well on mobile browsers
- FFmpeg.wasm (audio/video) requires significant memory — show a warning on devices with <2GB RAM
- The conversion grid on homepage should collapse to 2 columns on mobile, 1 column on small mobile
- Hub pages should use a list layout on mobile instead of grid

---

## Edge Cases & Error Handling

### Client-Side Processing

| Scenario | Handling |
|----------|----------|
| Browser doesn't support required API (e.g., SharedArrayBuffer for FFmpeg) | Show clear message: "Your browser doesn't support this conversion. Please use Chrome 92+, Firefox 79+, or Edge 92+." with fallback links to alternative tools |
| WASM module fails to load (network error) | Retry once, then show: "Converter failed to load. Check your internet connection and try again." |
| File too large for browser memory | For FFmpeg.wasm, warn at >500MB. For image canvas, warn at >50MP. Show file size limit in the upload zone |
| Conversion fails client-side | Show generic error with the specific error message. Suggest trying a different browser. Log error to server via `POST /api/client-error` for monitoring |
| User closes tab during conversion | Browser's `beforeunload` warning: "Conversion in progress. Are you sure you want to leave?" |
| Token expired before conversion completes (>5 min) | Silently request a new token. If rate limit now exceeded, show payment prompt |
| User has ad-blocker that blocks WASM loading | Detect blocked resources, show message explaining the converter requires loading additional resources |

### Rate Limiting for Client-Side

| Scenario | Handling |
|----------|----------|
| User blocks token API call (developer tools) | File selection still works, but conversion won't start without a valid token. The convert button is disabled until token is obtained |
| User bypasses token check (modifies JS) | Accept this as a known limitation. The token-gated system stops 99%+ of users. Determined developers who reverse-engineer the JS were never going to pay anyway |
| Token used but conversion not completed (page closed) | Token expires after 5 minutes. Rate-limit slot is consumed on token issuance, not on conversion-complete. This prevents abuse where users get unlimited tokens without completing conversions |
| Paid conversion token | Payment tokens bypass rate limit. Stripe webhook or `conversion-complete` endpoint records the paid conversion |

### FFmpeg.wasm Specific

| Scenario | Handling |
|----------|----------|
| Video conversion takes >5 minutes | Show elapsed time and progress. No hard timeout for client-side (user can wait as long as they want) |
| Audio-only conversion loaded full FFmpeg bundle | Use separate entry points: `@ffmpeg/ffmpeg` with audio-only codecs for audio conversions, full build for video |
| CORS issues with WASM loading | Serve WASM files from same origin (`/wasm/`), not CDN. Set appropriate CORS headers in Caddy |

---

## Implementation Phases

### Phase 9: Image Conversions + Client-Side Architecture (Priority: Highest)

**Scope:** Client-side converter infrastructure, Canvas-based image conversions, token API, category hub pages, homepage redesign.

1. Build client-side converter interface and registry (`app/lib/client-converters/`)
2. Implement Canvas-based image converter (handles ~12 of 16 image conversions)
3. Implement libheif WASM converter (HEIC → JPG/PNG)
4. Implement TIFF and ICO converters
5. Build `POST /api/conversion-token` endpoint
6. Build `POST /api/conversion-complete` endpoint
7. Add `processingMode` and `category` fields to `ConversionType` and DB schema
8. Create client-side conversion UI flow (file select → convert → download)
9. Add 16 image conversion entries to the conversion registry with AI-generated SEO content
10. Build category hub page component and routes
11. Redesign homepage with categorized grid
12. Update sitemap to include new pages and hub pages
13. Add COOP/COEP headers to Caddy config (needed for later FFmpeg.wasm phases)
14. Update privacy badge component for client-side vs server-side messaging

### Phase 10: Audio Conversions (Priority: High)

**Scope:** FFmpeg.wasm integration for audio conversions.

1. Integrate `@ffmpeg/ffmpeg` (audio-only build, ~8MB)
2. Implement FFmpeg.wasm converter wrapper with progress reporting
3. Add 7 audio conversion entries to registry with SEO content
4. Add audio-converter hub page
5. Handle WASM loading UX (download progress, caching)
6. Browser compatibility detection and fallback messaging

### Phase 11: Video Conversions (Priority: High)

**Scope:** Full FFmpeg.wasm for video conversions.

1. Integrate full FFmpeg.wasm build (~25MB) for video conversions
2. Implement video-specific progress reporting (frame-based)
3. Add 7 video conversion entries to registry with SEO content
4. Add video-converter hub page
5. Large file warnings and memory checks
6. `beforeunload` protection during long conversions

### Phase 12: Developer Data Formats (Priority: Medium)

**Scope:** Lightweight JS-based developer conversions.

1. Implement JSON ↔ YAML converter (js-yaml)
2. Implement JSON/XML ↔ CSV converters (Papa Parse, DOMParser)
3. Implement Markdown ↔ HTML converters (marked, Turndown)
4. Implement XML ↔ JSON converter
5. Add 9 developer conversion entries to registry with SEO content
6. Add developer-tools hub page
7. Developer-specific UX: paste input option (in addition to file upload), output preview

### Phase 13: Ebook Addition

**Scope:** Add EPUB → AZW3 server-side conversion.

1. Add Calibre AZW3 output support to existing calibre converter wrapper
2. Add `epub-to-azw3` entry to conversion registry
3. Update ebook-converter hub page (if not already created)

### Phase 14: Internationalization (Priority: Medium)

**Scope:** Spanish, Portuguese, German translations of all conversion and hub pages.

1. Extract all UI strings into locale files
2. Build locale routing (`/$locale/$conversionType`)
3. Generate AI translations for all conversion page SEO content (40+ pages × 3 languages)
4. Human review of translations
5. Add `hreflang` tags to all pages
6. Update sitemap with language variants
7. Add language switcher to header
8. Translate homepage and hub page content

### Phase 15: Blog Expansion (Priority: Medium)

**Scope:** 15–20 new blog posts across 4 content pillars.

1. AI-generate draft posts for all planned titles
2. Human review and edit for quality, accuracy, and brand voice
3. Add internal links from blog posts to conversion pages
4. Add Schema.org `Article` structured data
5. Organize blog index by content pillar/category
6. Update sitemap with new posts

---

## Open Questions & Risks

### Technical Risks

1. **FFmpeg.wasm bundle size (25MB)**: This is a significant download. Mitigation: lazy loading, aggressive caching, audio-only subset for audio conversions. Monitor actual user drop-off rates after first WASM load.

2. **SharedArrayBuffer requirement**: COOP/COEP headers required for FFmpeg.wasm may break third-party embeds (ads, Stripe.js). Need to test thoroughly. Mitigation: may need to isolate FFmpeg pages or use iframe sandboxing.

3. **HEIC support**: libheif WASM works but Safari already decodes HEIC natively via Canvas. Need to detect native support and only load WASM when needed.

4. **Client-side conversion quality**: Canvas API `toBlob('image/jpeg', quality)` quality may not match server-side ImageMagick. Need to test and document quality levels.

### Business Risks

1. **Token bypass**: Determined users can bypass client-side rate limiting. Accepted risk — these users would never pay regardless, and the privacy marketing value of client-side processing outweighs the revenue loss.

2. **SEO competition**: Image conversion keywords are dominated by DR 75+ sites. WittyFlip (new domain, low authority) will take months to rank. Mitigation: focus on long-tail variants and modern formats where competition is lower.

3. **COOP/COEP vs Stripe.js**: Cross-Origin-Embedder-Policy may conflict with Stripe.js iframe. Need to verify Stripe Checkout works with these headers or find a workaround (e.g., redirect-based checkout instead of embedded).

4. **Translation quality**: AI-generated translations for SEO content may not be idiomatic enough for native speakers. Budget for human review is essential.

### Open Decisions

1. **Rate limit slot consumption**: Should the free slot be consumed when the token is issued, or when `conversion-complete` is called? Token-issuance prevents abuse but punishes users whose conversion fails. Recommendation: consume on token issuance, but don't count failed conversions (client reports error → slot restored).

2. **Ad integration**: Should ads appear on client-side conversion pages? The competitive analysis shows ad revenue is significant (~$2M/year for iLovePDF). But ads may conflict with the privacy messaging and could be blocked by COOP/COEP headers.

3. **File size limits for client-side**: The current 10MB server limit doesn't apply to client-side conversions (no upload). Should client-side have higher limits (e.g., 50MB for images, 500MB for video)? Higher limits differentiate from competitors but may cause browser crashes on low-memory devices.

---

## Out of Scope

- **Developer API** — deferred to a future initiative (competitive analysis recommends it for backlink generation, but it's a separate product surface)
- **Affiliate program** — deferred (first-mover opportunity noted, but not part of this expansion)
- **Blog translation** — English-only for blog posts in this phase; blog i18n is a future effort
- **Server-side fallback for client-side conversions** — if the browser can't handle it, we show an error, not a server fallback (keeps architecture clean)
- **Mobile apps** — web-only
- **User accounts / login** — maintaining the guest-first model
- **Subscription pricing tier** — the competitive analysis recommends a $4.99–6.99/month option, but this is a separate pricing initiative
- **PDF-focused tools** (merge, split, compress) — dominated by iLovePDF/SmallPDF with 200M+ monthly visits; not a winnable battle for a new entrant
