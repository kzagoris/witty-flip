# WittyFlip - Document Conversion Service Specification

## Overview

WittyFlip is an online document conversion service targeting non-technical users who discover the tool via Google search. Users upload a file, it gets converted to their desired format, and they download the result. The service monetizes through a freemium model (limited free conversions with ads, then pay-per-file via Stripe) and focuses on niche, underserved conversion formats to avoid competing head-on with iLovePDF/SmallPDF.

## Goals & Success Criteria

### Primary Objectives

- Rank on Google page 1 for niche conversion keywords (e.g., "docx to markdown online", "djvu to pdf online")
- Generate revenue through ads (free users) and per-file payments ($0.49/conversion)
- Provide a fast, trustworthy, dead-simple conversion experience
- Launch quickly with minimal infrastructure cost ($5-10/mo VPS)

### Success Metrics

- Organic search traffic growth month-over-month
- Conversion rate: visitors who complete a file conversion
- Paid conversion rate: free users who hit the limit and pay
- Revenue per 1,000 visitors (RPM) from ads + payments combined
- Time to first conversion: < 30 seconds from landing on the page

## User Stories / Use Cases

### Core Flow

1. User googles "convert docx to markdown online"
2. Lands on `wittyflip.com/docx-to-markdown` (SSR page, SEO optimized)
3. Sees the upload area immediately — no navigation needed
4. Drags and drops their `.docx` file (or clicks to browse)
5. File uploads, conversion starts automatically (progress shown)
6. Download button appears with the `.md` file
7. User downloads and leaves happy

### Free Tier Exhausted

1. User has already used 2 free conversions today
2. Uploads a third file
3. Sees: "You've used your 2 free conversions today. Convert this file for $0.49"
4. Clicks "Pay & Convert" -> Stripe Checkout (guest, no account needed)
5. After payment, conversion runs and download becomes available

### Returning User

1. User returns the next day — free counter resets (tracked by IP)
2. Sees a small ad banner on the download page (Google AdSense)

## Technical Design

### Architecture Overview

```
wittyflip.com
|
| Caddy (reverse proxy, auto SSL)
|
| TanStack Start (SSR + API)
| |-- Pages (SSR landing pages per conversion)
| |-- API routes (upload, convert, payment webhook)
| |-- Server utils (Pandoc/tool wrappers)
|
| SQLite (Drizzle ORM)
| |-- rate_limits (IP tracking)
| |-- payments (Stripe records)
| |-- conversions (analytics log)
|
| Local Disk
| |-- /conversions/ (temp file storage, auto-cleanup)
|
| System Tools
| |-- Pandoc, LibreOffice, djvulibre, Calibre, texlive
```

### Tech Stack

| Component | Technology | Rationale |
|---|---|---|
| **Framework** | TanStack Start (React) | SSR for SEO, excellent DX, type-safe server functions, Vite-based |
| **Styling** | Tailwind CSS | User knows it well, utility-first, fast to iterate |
| **UI Components** | shadcn/ui or custom Tailwind | Accessible, composable, no heavy library |
| **Database** | SQLite + Drizzle ORM | Zero-config, embedded, low resource usage. Drizzle enables future PostgreSQL migration |
| **Payments** | Stripe Checkout (guest mode) | No account needed, handles PCI compliance, simple integration |
| **Ads** | Google AdSense | Standard, easy setup, good CPM for converter keywords |
| **Reverse Proxy** | Caddy | Auto SSL (Let's Encrypt), simple config, HTTP/2+3 |
| **Deployment** | Docker on Hetzner VPS | $5-10/mo, full control, reproducible builds |

### Conversion Tools

| Conversion | Tool | Command Example |
|---|---|---|
| DOCX -> Markdown | Pandoc | `pandoc input.docx -t markdown -o output.md` |
| Markdown -> PDF | Pandoc + LaTeX/weasyprint | `pandoc input.md -o output.pdf --pdf-engine=weasyprint` |
| HTML -> PDF | Puppeteer or weasyprint | `weasyprint input.html output.pdf` |
| DJVU -> PDF | djvulibre | `ddjvu -format=pdf input.djvu output.pdf` |
| EPUB -> MOBI | Calibre | `ebook-convert input.epub output.mobi` |
| ODT -> DOCX | Pandoc or LibreOffice | `pandoc input.odt -o output.docx` |
| LaTeX -> PDF | pdflatex | `pdflatex input.tex` |

### Data Model

```sql
-- Rate limiting by IP
CREATE TABLE rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL,
  conversion_count INTEGER DEFAULT 0,
  date TEXT NOT NULL, -- YYYY-MM-DD
  UNIQUE(ip_address, date)
);

-- Payment records
CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_session_id TEXT UNIQUE NOT NULL,
  stripe_payment_intent TEXT,
  amount_cents INTEGER NOT NULL, -- 49 = $0.49
  currency TEXT DEFAULT 'usd',
  ip_address TEXT NOT NULL,
  conversion_type TEXT NOT NULL, -- e.g., 'docx-to-markdown'
  status TEXT DEFAULT 'pending', -- pending, completed, failed
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

-- Conversion analytics log
CREATE TABLE conversions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversion_type TEXT NOT NULL, -- e.g., 'docx-to-markdown'
  ip_address TEXT NOT NULL,
  file_size_bytes INTEGER,
  conversion_time_ms INTEGER,
  was_paid INTEGER DEFAULT 0, -- boolean: 0=free, 1=paid
  status TEXT DEFAULT 'completed', -- completed, failed, timeout
  created_at TEXT DEFAULT (datetime('now'))
);
```

### API Routes

```
POST /api/upload
  - Accepts multipart file upload
  - Validates: file type (magic bytes), file size (<10MB), rate limit
  - Returns: { fileId: "uuid", status: "ready" }

POST /api/convert
  - Body: { fileId, targetFormat }
  - Runs conversion subprocess with timeout (30s)
  - Returns: { fileId, downloadUrl, status: "completed" }

GET /api/download/:fileId
  - Serves converted file
  - Sets Content-Disposition header for download
  - Deletes file reference after successful download (optional)

POST /api/create-checkout
  - Body: { fileId, conversionType }
  - Creates Stripe Checkout session
  - Returns: { checkoutUrl }

POST /api/webhook/stripe
  - Stripe webhook for payment confirmation
  - On success: marks payment complete, triggers conversion

GET /api/rate-limit-status
  - Returns: { remaining: 2, limit: 2, resetAt: "2026-03-08T00:00:00Z" }
```

### File Processing Pipeline

```
1. Upload
   - Generate UUID filename (never use user's filename on disk)
   - Validate magic bytes match declared file type
   - Enforce 10MB size limit
   - Save to /conversions/{uuid}.{ext}

2. Rate Limit Check
   - Query rate_limits table for IP + today's date
   - If count < 2: proceed (free)
   - If count >= 2: return "payment required" with Stripe checkout URL

3. Convert
   - Spawn conversion tool as child process
   - Set timeout: 30 seconds
   - Set memory limit via ulimit or cgroup
   - Save output to /conversions/{uuid}-output.{ext}
   - Log conversion to analytics table

4. Download
   - Serve file with proper Content-Type and Content-Disposition
   - File remains available for 1 hour

5. Cleanup
   - Cron job every 15 minutes: find /conversions -mmin +60 -delete
   - Also cleanup on process shutdown (graceful)
```

## Monetization Model

### Phase 1 (Launch)

| Tier | Details |
|---|---|
| **Free** | 2 conversions/day per IP. Ads shown (Google AdSense on download page). Max 10MB file size. |
| **Paid** | $0.49 per file via Stripe Checkout (guest, no account). No ads on paid conversion result. Max 10MB file size. |

### Phase 2 (After Traction)

| Addition | Details |
|---|---|
| **Google Sign-In** | Optional. Logged-in users get 5 free/day + conversion history. |
| **Monthly Plan** | $4.99/mo for unlimited conversions, no ads, larger file sizes (50MB). |

### Phase 3 (Scale)

| Addition | Details |
|---|---|
| **Batch Conversion** | Upload multiple files, convert all, download as ZIP. Premium feature. |
| **API Access** | $9.99/mo developer plan with REST API and API keys. |
| **PDF Tools** | Merge, split, compress PDF. High-traffic expansion. |
| **Credit Packs** | Buy 20 conversions for $7.99 (no expiry). |

### Revenue Streams

1. **Per-file payments** ($0.49 each via Stripe)
2. **Google AdSense** on free conversion pages (~$2-8 RPM)
3. **Subscriptions** (Phase 2+)

## SEO Strategy

SEO is the primary acquisition channel. 70%+ of competitor traffic comes from organic search.

### Page Structure

**1. Conversion Landing Pages (7 at launch)**

Each conversion gets a dedicated SSR page optimized for search:

| URL | Target Keyword |
|---|---|
| `/docx-to-markdown` | "convert docx to markdown online" |
| `/markdown-to-pdf` | "convert markdown to pdf online" |
| `/html-to-pdf` | "convert html to pdf online" |
| `/djvu-to-pdf` | "convert djvu to pdf online" |
| `/epub-to-mobi` | "convert epub to mobi online" |
| `/odt-to-docx` | "convert odt to docx online" |
| `/latex-to-pdf` | "convert latex to pdf online" |

Each page includes:
- Unique `<title>` and `<meta description>` (e.g., "Convert DOCX to Markdown Online Free | WittyFlip")
- H1 with target keyword
- The converter tool (upload area) above the fold
- 300-500 words of helpful content below: how it works, format explanation, use cases
- FAQ section (targets featured snippets)
- Related conversions links (internal linking)
- Structured data: `HowTo`, `SoftwareApplication`, `FAQPage` schemas

**2. Blog Posts (1-2 per conversion)**

Supporting content for long-tail keywords:
- "How to Convert DOCX to Markdown: 5 Methods Compared"
- "Best DJVU to PDF Converters in 2026"
- "LaTeX to PDF: Complete Guide for Researchers"
- "EPUB vs MOBI: Which Ebook Format to Use"

**3. Programmatic SEO Pages**

Auto-generate pages for reverse conversions and future formats:
- `/markdown-to-docx`, `/pdf-to-djvu`, `/mobi-to-epub`
- Show "Coming soon" with email capture for unsupported conversions
- Each page is indexable and captures search intent

**4. Technical SEO**

- Server-side rendering (TanStack Start) for all pages
- `sitemap.xml` auto-generated from all conversion routes
- `robots.txt` properly configured
- Open Graph tags + Twitter Cards for social sharing
- Core Web Vitals: < 2s page load, good LCP/CLS/INP
- Mobile-responsive (majority of search traffic is mobile)
- Canonical URLs to prevent duplicate content

## UI/UX Requirements

### Design Direction

**Bold and colorful** — differentiate from the bland white converter competitors.

- **Primary brand color:** Vibrant (purple, coral, or electric blue — TBD)
- **Format-specific colors:** DOCX=blue, PDF=red, Markdown=purple, LaTeX=green, EPUB=teal, DJVU=amber, ODT=orange
- **Typography:** Bold headings (Plus Jakarta Sans or Geist), clean body text (Inter)
- **Gradient backgrounds:** Vibrant hero sections per conversion page
- **Micro-animations:** Upload pulse, slide-in file icon, smooth progress bar, success celebration, download button bounce

### Page Layout

```
+---------------------------------------------+
|  WittyFlip Logo      [All Conversions v]    |
+---------------------------------------------+
|                                             |
|  Convert DOCX to Markdown                   |
|  Free online converter - no signup needed   |
|                                             |
|  +---------------------------------------+  |
|  |                                       |  |
|  |   [icon] Drop your .docx file here    |  |
|  |          or click to browse           |  |
|  |                                       |  |
|  +---------------------------------------+  |
|                                             |
|  [After upload:]                            |
|  document.docx -> Markdown                  |
|  [========= Converting... 70% ==========]  |
|                                             |
|  [Download Markdown File]                   |
|                                             |
|  --- Ad banner (free users only) ---        |
|                                             |
+---------------------------------------------+
|  How to Convert DOCX to Markdown            |
|  (SEO content: 300-500 words)               |
|                                             |
|  FAQ                                        |
|  - What is DOCX format?                     |
|  - What is Markdown?                        |
|  - Is my file safe?                         |
|                                             |
|  Related Conversions                        |
|  [Markdown->PDF] [ODT->DOCX] [HTML->PDF]   |
+---------------------------------------------+
|  Footer: Privacy | Terms | Contact          |
+---------------------------------------------+
```

### Interaction States

| State | UI |
|---|---|
| **Idle** | Upload area with subtle pulse animation. Drag-and-drop + click to browse. |
| **Dragging** | Upload area highlights with border color change and scale-up effect. |
| **Uploading** | File icon slides in, upload progress bar appears. |
| **Converting** | Animated progress bar with format conversion animation (DOCX icon -> MD icon). |
| **Complete** | Green checkmark animation, bold download button with bounce effect. |
| **Error** | Red indicator with clear error message and "Try Again" button. |
| **Rate Limited** | Friendly message: "You've used your free conversions today" + Stripe pay button. |

### Mobile UX

- Full-width upload area with large tap target
- Bottom-sheet for conversion results
- Simplified layout, no sidebar
- Touch-friendly file picker

### Trust Signals

- "Your files are encrypted and deleted after 1 hour"
- Conversion counter: "12,847 files converted this week"
- Clean, professional design with no dark patterns
- HTTPS lock visible in browser

## Security

### File Upload Security

| Threat | Mitigation |
|---|---|
| **Malicious files** | Run conversion tools in sandboxed subprocess. Docker container provides isolation. |
| **Path traversal** | Never use user-provided filenames. All files renamed to UUID on upload. |
| **Resource exhaustion** | 10MB file size limit. 30-second conversion timeout. Memory limit per process. |
| **SSRF (HTML->PDF)** | Disable network access in conversion tools. Block outbound requests. |
| **File type spoofing** | Validate magic bytes (not just extension) using `file-type` npm package. |
| **Concurrent abuse** | Rate limit: max 10 requests/minute per IP. |

### Application Security

- Run Node.js as non-root user inside Docker
- Mount `/conversions` directory with `noexec` flag
- Conversion subprocess with reduced Linux capabilities (`--cap-drop=ALL`)
- Auto-delete uploaded files even on conversion failure (finally block)
- Never serve user-uploaded files directly — always generate fresh download response
- CSRF protection on all API routes
- Stripe webhook signature verification
- Input validation on all API endpoints
- Security headers via Caddy (HSTS, X-Frame-Options, CSP)

## Deployment

### Infrastructure

```
Hetzner VPS ($5-10/mo)
+-- Docker
|   +-- docker-compose.yml
|   |   +-- app (TanStack Start + Pandoc + LibreOffice + tools)
|   |   +-- caddy (reverse proxy + auto SSL)
|   +-- volumes
|       +-- ./data/sqlite.db (database)
|       +-- ./data/conversions/ (temp files)
+-- Cron: cleanup old files every 15 minutes
```

### Docker Configuration

```dockerfile
# Dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y \
    pandoc \
    libreoffice-writer \
    djvulibre-bin \
    calibre \
    texlive-latex-base \
    texlive-fonts-recommended \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m appuser
USER appuser

WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
      - NODE_ENV=production
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    restart: unless-stopped

volumes:
  caddy_data:
```

```
# Caddyfile
wittyflip.com {
    reverse_proxy app:3000
}
```

### Deployment Flow

1. Push code to GitHub
2. SSH into VPS: `git pull && docker compose up --build -d`
3. Future: GitHub Actions for automated deployment on push to main

### Monitoring

- Basic: Docker logs + `docker stats`
- Uptime: UptimeRobot (free tier) or similar
- Analytics: Plausible Analytics (self-hosted, privacy-friendly) or Google Analytics
- Error tracking: Sentry (free tier)

## Project Structure

```
wittyflip/
+-- app/
|   +-- routes/
|   |   +-- index.tsx                 # Homepage (lists all conversions)
|   |   +-- $conversionType.tsx       # Dynamic SSR page per conversion
|   |   +-- blog/
|   |       +-- $slug.tsx             # Blog post pages
|   +-- components/
|   |   +-- FileUploader.tsx          # Drag & drop upload component
|   |   +-- ConversionProgress.tsx    # Progress bar + status
|   |   +-- DownloadButton.tsx        # Download result
|   |   +-- PaymentPrompt.tsx         # Stripe checkout prompt
|   |   +-- AdBanner.tsx              # AdSense wrapper
|   |   +-- ConversionCard.tsx        # Card for listing conversions
|   |   +-- Header.tsx
|   |   +-- Footer.tsx
|   |   +-- SEOHead.tsx               # Meta tags, structured data
|   +-- lib/
|   |   +-- converters/
|   |   |   +-- pandoc.ts             # Pandoc wrapper
|   |   |   +-- libreoffice.ts        # LibreOffice wrapper
|   |   |   +-- djvulibre.ts          # DJVU converter wrapper
|   |   |   +-- calibre.ts            # Calibre wrapper
|   |   |   +-- weasyprint.ts         # HTML/CSS to PDF wrapper
|   |   |   +-- index.ts              # Converter registry
|   |   +-- db/
|   |   |   +-- schema.ts             # Drizzle schema
|   |   |   +-- index.ts              # DB connection
|   |   +-- stripe.ts                 # Stripe integration
|   |   +-- rate-limit.ts             # IP-based rate limiting
|   |   +-- file-validation.ts        # Magic byte checking
|   |   +-- conversions.ts            # Supported conversion definitions
|   +-- server/
|   |   +-- api/
|   |       +-- upload.ts
|   |       +-- convert.ts
|   |       +-- download.ts
|   |       +-- create-checkout.ts
|   |       +-- webhook/
|   |           +-- stripe.ts
|   +-- styles/
|       +-- globals.css               # Tailwind base + custom styles
+-- data/
|   +-- conversions/                  # Temp file storage (gitignored)
|   +-- sqlite.db                     # Database (gitignored)
+-- content/
|   +-- blog/                         # Markdown blog posts
+-- public/
|   +-- icons/                        # Format-specific icons
|   +-- og-images/                    # Social sharing images per conversion
+-- docker-compose.yml
+-- Dockerfile
+-- Caddyfile
+-- drizzle.config.ts
+-- tailwind.config.ts
+-- package.json
+-- tsconfig.json
```

## Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| Unsupported file type uploaded | Validate magic bytes. Show clear error: "This file type isn't supported. We accept: .docx, .md, .html, .djvu, .epub, .odt, .tex" |
| File too large (>10MB) | Client-side check before upload. Server-side enforcement. Show: "File too large. Maximum size is 10MB." |
| Conversion fails | Log error, delete temp files, show: "Conversion failed. Please try again or try a different file." Return 500 with user-friendly message. |
| Conversion timeout (>30s) | Kill subprocess, clean up, show timeout message. |
| Stripe payment fails | Show Stripe's error message. File is not converted. User can retry. |
| Stripe webhook delayed | Conversion waits for webhook confirmation. Show "Processing payment..." with polling. |
| VPS disk full | Monitor disk usage. Alert at 80%. Cleanup cron prevents this. |
| Concurrent conversions overload | Queue with max 5 concurrent conversions. Show "Server busy, please wait..." for overflow. |
| User refreshes during conversion | Conversion continues server-side. Result available via fileId polling. |
| Corrupted input file | Pandoc/tools will fail gracefully. Catch error, show user-friendly message. |

## Open Questions & Risks

### Open Questions

1. **Exact brand color palette** — need to finalize primary + accent colors for the bold/colorful design direction
2. **Domain availability** — check wittyflip.com, wittyflip.io, wittyflip.app
3. **AdSense approval timeline** — Google AdSense requires site review; may take days/weeks. Plan for launch without ads.
4. **Stripe country/currency** — confirm Stripe availability in your country and supported currencies
5. **Conversion quality** — need to test each conversion pair for output quality before launch. Pandoc DOCX->MD may lose complex formatting.
6. **weasyprint vs Puppeteer for HTML->PDF** — need to benchmark quality and performance

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Low search traffic for niche keywords | Medium | High | Validate with Google Keyword Planner before launch. Expand to more formats quickly. |
| Conversion quality issues | Medium | Medium | Test extensively. Show format-specific warnings. Allow user feedback. |
| Server resource limits on $5 VPS | Low | Medium | LibreOffice is heavy. Monitor RAM. Upgrade VPS if needed ($10-20/mo). |
| Abuse / scraping | Low | Low | Rate limiting + IP tracking. Can add CAPTCHA if needed. |
| Stripe regulatory issues | Low | High | Verify Stripe availability in your country early. |

## Out of Scope (for v1)

- User accounts and authentication
- Batch/multi-file conversion
- API access for developers
- PDF tools (merge, split, compress)
- Image format conversions (PNG, JPG, WebP, HEIC)
- Subscription billing
- File conversion history
- Mobile app
- Multi-language support (i18n)
- OCR / scanned document support
