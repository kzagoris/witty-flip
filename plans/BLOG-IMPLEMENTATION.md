# Blog System Implementation Plan

## Context

Phases 1–5 are complete: foundation, converters, API routes, UI, and observability. This plan covers the **blog system** (original Phase 7) — the last remaining product feature before launch. The Docker `HEALTHCHECK` is tracked separately as an ops follow-up so the blog scope stays focused.

The blog system serves two purposes:
1. **SEO long-tail traffic** — blog posts targeting supporting keywords that link back to conversion landing pages
2. **User trust** — educational content that positions WittyFlip as a knowledgeable, helpful tool

### Decisions Made

| Decision | Choice |
|----------|--------|
| Rendering strategy | SSR on every request via route loaders that call server-only blog functions (`createServerFn`/`callServerFn`); file IO stays outside route modules |
| Prose styling | @tailwindcss/typography plugin |
| Blog content | Real SEO-quality content for all 4 posts (800–1200 words each) |
| Blog CTA | Top banner + bottom CTA card, both linking to the related conversion page in v1 |
| OG images | Optional `ogImage` frontmatter field, resolved to an absolute URL in route head metadata using `BASE_URL` |
| Sitemap | Auto-scan `content/blog/` directory at request time |
| Design | Full spec vision — format-specific gradients, brand colors, existing animations |
| Ops scope | Docker `HEALTHCHECK` remains a separate ops task outside the blog rollout |

---

## Step 1: Install Dependencies

- **Modify:** `package.json`
- **Add:** `gray-matter` (frontmatter parsing), `marked` (markdown → HTML), `@tailwindcss/typography` (prose plugin)
- **Verify:** `npm install && npm run type-check`

### Notes
- `gray-matter` parses YAML frontmatter from `.md` files
- `marked` converts markdown body to HTML (synchronous, fast)
- `@tailwindcss/typography` provides the `prose` class with comprehensive styling for rendered markdown (blockquotes, tables, nested lists, images, code blocks — more complete than the existing custom `.prose` rules)

---

## Step 2: Server-only Blog Data Layer (`app/lib/blog.ts` + `app/server/api/blog.ts`) — **new files**

Shared server-side data layer for reading and parsing blog posts from `content/blog/`, exposed to routes through TanStack Start server functions.

### Interface

```typescript
export interface BlogPost {
  slug: string
  title: string
  description: string
  date: string              // ISO date string (YYYY-MM-DD)
  relatedConversion: string // slug from conversions.ts (e.g. 'docx-to-markdown')
  ogImage?: string          // optional path relative to /public
  content: string           // raw markdown body (for rendering)
  html: string              // parsed HTML from marked
  readingTimeMin: number    // estimated reading time
}

export interface BlogPostSummary {
  slug: string
  title: string
  description: string
  date: string
  relatedConversion: string
}
```

### Internal Helpers (`app/lib/blog.ts`)

- `readBlogPost(slug: string): BlogPost | null` — Read `content/blog/{slug}.md`, parse with `gray-matter`, convert body with `marked`, validate required frontmatter fields, return `null` if the file is missing or invalid
- `readAllBlogPosts(): BlogPostSummary[]` — Scan `content/blog/*.md`, parse frontmatter only (skip `marked`), sort by date descending, return summaries
- `readAllBlogSlugs(): string[]` — Lightweight version for sitemap (just filenames without `.md`)

### Server Functions (`app/server/api/blog.ts`)

- `getBlogPostBySlug = createServerFn({ method: "GET" })` — Route-safe wrapper around `readBlogPost`
- `getBlogPosts = createServerFn({ method: "GET" })` — Route-safe wrapper around `readAllBlogPosts`
- `getBlogSlugs = createServerOnlyFn(...)` (or equivalent server helper) — Reused by the sitemap handler without importing file IO directly into route modules

### Frontmatter Schema

```yaml
---
title: "How to Convert DOCX to Markdown: 5 Methods Compared"
description: "Compare 5 ways to convert Word documents to Markdown..."
date: "2026-03-10"
slug: "docx-to-markdown-guide"
relatedConversion: "docx-to-markdown"
ogImage: "/og-images/docx-to-markdown-guide.png"  # optional
---
```

### Validation

- Required fields: `title`, `description`, `date`, `slug`, `relatedConversion`
- `relatedConversion` must match a valid slug from `conversions.ts` (validate with `getConversionBySlug`)
- `date` must be a valid YYYY-MM-DD string
- `slug` must match the filename (e.g., `docx-to-markdown-guide.md` → slug `docx-to-markdown-guide`)
- Log a warning (via Pino logger) for invalid posts and skip them rather than crashing list pages or the sitemap

### Reading Time

- Estimate: `Math.max(1, Math.ceil(wordCount / 200))` minutes
- Word count from raw markdown body (strip markdown syntax not needed — rough estimate is fine)

### Architecture Notes

- Do **not** import file-system blog readers directly into `app/routes/blog/*.tsx`
- Follow the existing `createServerOnlyFn` + dynamic import pattern already used in `app/server/api/*`
- Route loaders should fetch blog data via `callServerFn(...)`, matching the current `rate-limit-status` pattern

---

## Step 3: Blog Post Route (`app/routes/blog/$slug.tsx`) — **new file**

Dynamic route for individual blog posts at `/blog/{slug}`.

### Loader

- Call `callServerFn(getBlogPostBySlug, { slug: params.slug })`
- If the server function returns a missing/invalid post, throw `notFound()`
- Also load the related conversion via `getConversionBySlug(post.relatedConversion)` for the CTA section
- Return `{ post, relatedConversion }`

### Head

- `<title>`: `{post.title} | WittyFlip Blog`
- `<meta name="description">`: `post.description`
- `<link rel="canonical">`: absolute `/blog/{slug}` URL derived from `BASE_URL`
- `<meta property="og:title">`: `post.title`
- `<meta property="og:description">`: `post.description`
- `<meta property="og:type">`: `article`
- `<meta property="og:url">`: absolute canonical URL
- `<meta property="og:image">`: absolute URL for `post.ogImage ?? '/og-default.png'`
- `<meta name="twitter:card">`: `summary_large_image`
- `<meta name="twitter:title">`: `post.title`
- `<meta name="twitter:description">`: `post.description`
- `<meta name="twitter:image">`: same absolute image URL as Open Graph
- `<meta property="article:published_time">`: `post.date`
- JSON-LD `Article` structured data:
  ```json
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "...",
    "description": "...",
    "datePublished": "...",
    "image": "https://wittyflip.com/og-default.png",
    "mainEntityOfPage": "https://wittyflip.com/blog/docx-to-markdown-guide",
    "publisher": { "@type": "Organization", "name": "WittyFlip" }
  }
  ```

### Component Layout

```
┌─────────────────────────────────────────────────┐
│  ← Back to Blog          [reading time badge]   │
│                                                  │
│  [date]                                          │
│  <h1> Post Title </h1>                           │
│  <p> Post description </p>                       │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │  🔗  Try our DOCX to Markdown converter  │    │  ← Top CTA banner
│  │      [Convert Now →]                      │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  <article class="prose prose-lg">                │
│    [rendered markdown HTML]                      │
│  </article>                                      │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │  Convert Your Files Now                   │    │  ← Bottom CTA with
│  │  [Try it now →]                           │    │    prominent link
│  └──────────────────────────────────────────┘    │
│                                                  │
│  Related Posts  (if any share relatedConversion) │
└─────────────────────────────────────────────────┘
```

### Components to Create

- **`app/components/blog/BlogCTABanner.tsx`** — Top banner linking to the related conversion page. Uses the conversion's `formatColor` as accent. Contains conversion name and a "Convert Now →" link.
- **`app/components/blog/BlogBottomCTA.tsx`** — Bottom section with a heading ("Convert Your Files Now"), brief text, and a prominent link/button to the related conversion page.
- **`app/components/blog/BlogPostHeader.tsx`** — Date display, title (h1), description, reading time badge.

### Design Notes

- Use `PageShell` for max-width consistency
- The `prose` class from `@tailwindcss/typography` handles all markdown HTML styling
- The "Back to Blog" link uses `<Link to="/blog">` (TanStack Router)
- Top CTA banner: rounded card with left border in `formatColor`, subtle background tint
- Bottom CTA section: full-width card with gradient background matching the related conversion's `formatColor`
- The bottom CTA stays link-based in v1 to avoid duplicating upload/conversion state inside blog routes

### CTA Decision

- Use links for both CTAs in v1
- Do not embed `FileUploader` on blog routes yet
- This keeps blog pages presentational and avoids file handoff/state duplication
- Revisit inline upload later only if analytics show a clear conversion benefit

---

## Step 4: Blog Index Route (`app/routes/blog/index.tsx`) — **new file**

Blog index page at `/blog`.

### Loader

- Call `callServerFn(getBlogPosts)` to get all post summaries sorted by date descending
- Return `{ posts }`

### Head

- `<title>`: `Blog | WittyFlip`
- `<meta name="description">`: `Guides, tips, and comparisons for document conversion. Learn about DOCX, PDF, Markdown, LaTeX, EPUB, and more.`
- `<link rel="canonical">`: absolute `/blog` URL derived from `BASE_URL`
- OG tags matching title/description
- `<meta property="og:url">`: absolute canonical URL
- `<meta property="og:image">`: absolute URL for the site-wide fallback image
- `<meta name="twitter:card">`: `summary_large_image`
- `<meta name="twitter:image">`: same absolute image URL as Open Graph

### Component Layout

```
┌────────────────────────────────────────────┐
│  <h1> WittyFlip Blog </h1>                 │
│  <p> Guides and tips for document          │
│      conversion </p>                       │
│                                            │
│  ┌──────────┐  ┌──────────┐               │
│  │ Post 1   │  │ Post 2   │               │   ← Responsive grid
│  │ [date]   │  │ [date]   │               │     (1 col mobile,
│  │ [title]  │  │ [title]  │               │      2 col desktop)
│  │ [desc]   │  │ [desc]   │               │
│  │ [badge]  │  │ [badge]  │               │
│  └──────────┘  └──────────┘               │
│  ┌──────────┐  ┌──────────┐               │
│  │ Post 3   │  │ Post 4   │               │
│  └──────────┘  └──────────┘               │
└────────────────────────────────────────────┘
```

### Components to Create

- **`app/components/blog/BlogPostCard.tsx`** — Card for the blog index grid. Shows: date (formatted), title, description (truncated), related conversion badge (with format color dot). Links to `/blog/{slug}`. Hover: subtle scale + shadow effect matching ConversionCard pattern.

### Design Notes

- Use `PageShell` wrapper
- Card grid: `grid grid-cols-1 gap-6 sm:grid-cols-2`
- Each card shows a small badge indicating the related conversion type (e.g., "DOCX → Markdown") using the format color
- No pagination needed for 4 posts — show all

---

## Step 5: Blog Content — 4 Markdown Posts

Create 4 blog posts in `content/blog/`. Each should be 800–1200 words of real SEO-quality content.

### Post 1: `content/blog/docx-to-markdown-guide.md`

- **Title:** "How to Convert DOCX to Markdown: 5 Methods Compared"
- **Related conversion:** `docx-to-markdown`
- **Target keywords:** "docx to markdown", "word to markdown converter", "convert word to md"
- **Content outline:**
  - Introduction: why convert DOCX to Markdown (GitHub, docs-as-code, static sites)
  - Method 1: WittyFlip (online, free, instant — primary CTA)
  - Method 2: Pandoc CLI (powerful, for developers)
  - Method 3: VS Code extensions
  - Method 4: Google Docs export workaround
  - Method 5: Manual copy-paste approach
  - Comparison table (ease, quality, features, price)
  - When to use each method
  - Conclusion with CTA back to converter

### Post 2: `content/blog/djvu-to-pdf-guide.md`

- **Title:** "How to Convert DJVU to PDF Without Installing Software"
- **Related conversion:** `djvu-to-pdf`
- **Target keywords:** "djvu to pdf online", "convert djvu to pdf", "djvu converter"
- **Content outline:**
  - Introduction: what is DJVU and why convert to PDF
  - DJVU format explained (when it's used, academic/scanned documents)
  - Method 1: WittyFlip online converter (primary)
  - Method 2: djvulibre command-line tools
  - Method 3: Other online converters (brief comparison)
  - Quality considerations (scanned images, OCR layers)
  - File size: DJVU vs PDF trade-offs
  - Conclusion with CTA

### Post 3: `content/blog/latex-to-pdf-guide.md`

- **Title:** "LaTeX to PDF: Complete Guide for Researchers"
- **Related conversion:** `latex-to-pdf`
- **Target keywords:** "latex to pdf", "compile latex online", "latex pdf converter"
- **Content outline:**
  - Introduction: LaTeX in academic and scientific publishing
  - Quick conversion: WittyFlip (upload .tex, get PDF — primary)
  - Full LaTeX workflow: Overleaf, TeX Live, MiKTeX
  - Common compilation errors and how to fix them
  - Packages and fonts: what WittyFlip supports (texlive-base + recommended fonts)
  - Tips for clean LaTeX documents
  - Conclusion with CTA

### Post 4: `content/blog/epub-vs-mobi.md`

- **Title:** "EPUB vs MOBI: Which Ebook Format Should You Use?"
- **Related conversion:** `epub-to-mobi`
- **Target keywords:** "epub vs mobi", "ebook format comparison", "epub to mobi"
- **Content outline:**
  - Introduction: the ebook format landscape
  - EPUB: what it is, who uses it, pros and cons
  - MOBI: what it is, Kindle ecosystem, pros and cons
  - Side-by-side comparison table (DRM, device support, features, typography)
  - When to use EPUB vs MOBI
  - How to convert between them: WittyFlip (primary CTA)
  - The future: Kindle now supports EPUB (discuss the shift)
  - Conclusion

### Content Quality Guidelines

- Write for non-technical users who found the page via Google search
- Use H2 for main sections, H3 for subsections
- Include a comparison table where applicable (markdown tables)
- Internal links: link to the WittyFlip conversion page using relative URLs (e.g., `[convert your file here](/docx-to-markdown)`)
- Don't stuff keywords — write naturally, mention the target keyword 3–5 times
- Include a clear "try it now" callout pointing to the conversion page
- Each post should be self-contained and useful even without using WittyFlip

---

## Step 6: Update Sitemap to Include Blog Posts

- **Modify:** `app/routes/api/sitemap[.]xml.tsx`
- Reuse the Step 2 server-only blog helpers inside `handleSitemapRequest()`
- Use a dynamic import or equivalent server-only helper call inside the route handler so file IO is not pulled into the route module at top level
- Add blog post URLs to the sitemap XML:
  ```xml
  <url><loc>https://wittyflip.com/blog</loc></url>
  <url><loc>https://wittyflip.com/blog/docx-to-markdown-guide</loc></url>
  ...
  ```
- Blog URLs are auto-discovered by scanning `content/blog/` — no manual registration needed
- Maintain existing conversion type URLs

---

## Step 7: Update Header Navigation

- **Modify:** `app/components/layout/Header.tsx`
- Add a "Blog" link next to the "All Conversions" dropdown
- Simple text link: `<Link to="/blog">Blog</Link>`
- Use the existing `Button variant="ghost" size="sm"` style for consistency

---

## Step 8: Update Tailwind Typography Configuration

- **Modify:** `app/styles/globals.css`
- After installing `@tailwindcss/typography`, the `prose` class becomes available via the plugin
- Remove or merge the existing custom `.prose` rules in the `@layer components` block with the typography plugin's defaults
- The plugin provides comprehensive styling for: blockquotes, tables, images, code blocks, horizontal rules, nested lists, figure captions — all of which the custom rules don't cover
- Keep any custom overrides that differ from the plugin defaults (e.g., heading font-family using `--font-heading`)

### Approach

- Replace the custom `.prose` block with typography plugin classes
- Use `prose-headings:font-heading` or equivalent Tailwind modifiers to maintain Plus Jakarta Sans for headings in blog content
- The existing SEOContent component on conversion pages also uses `.prose` — verify it still renders correctly after the switch

---

## Step 9: Testing & Verification

### Test Coverage to Add

- **Create:** `tests/unit/blog.test.ts`
  - frontmatter validation rejects missing or invalid fields
  - `slug` must match the filename
  - `relatedConversion` must match a real conversion slug
  - posts are sorted newest-first
  - reading time calculation is stable
- **Create:** `tests/integration/blog-routes.test.ts`
  - `GET /blog` renders the blog index
  - `GET /blog/{slug}` renders a post
  - `GET /blog/nonexistent` returns 404
  - `GET /api/sitemap.xml` includes `/blog` and the discovered post URLs

### Automated Validation

1. `npm install` succeeds with new dependencies
2. `npm run type-check` passes
3. `npm run lint` passes
4. `npm run test` passes
5. `npm run build` succeeds

### Blog System

6. Visit `/blog` — shows 4 post cards in a grid
7. Visit `/blog/docx-to-markdown-guide` — renders full post with prose styling
8. Top CTA banner links to `/docx-to-markdown`
9. Bottom CTA section links to `/docx-to-markdown`
10. "Back to Blog" link works
11. Visit `/blog/nonexistent` — shows 404
12. Sitemap at `/api/sitemap.xml` includes all 4 blog post URLs + `/blog` index
13. View page source — canonical URL, OG tags, Twitter card tags, and JSON-LD Article schema are present
14. Header shows "Blog" link that navigates to `/blog`

### Typography

15. Blog post renders blockquotes, tables, code blocks, images correctly
16. Conversion pages' SEO content still renders correctly with updated prose styles
17. Headings in prose use Plus Jakarta Sans font

### SEO Spot Check

18. `curl -s http://localhost:3000/blog/docx-to-markdown-guide | grep '<title>'` shows correct title
19. `curl -s http://localhost:3000/api/sitemap.xml | grep 'blog'` shows blog URLs
20. `curl -s http://localhost:3000/blog/docx-to-markdown-guide | grep 'twitter:card'` shows social tags
21. `curl -s http://localhost:3000/blog/docx-to-markdown-guide | grep 'canonical'` shows the canonical URL
22. `curl -s http://localhost:3000/blog/docx-to-markdown-guide | grep 'og:image'` shows an absolute image URL

---

## Key Files to Create/Modify

| File | Action | Step |
|------|--------|------|
| `package.json` | Modify (add gray-matter, marked, @tailwindcss/typography) | 1 |
| `app/lib/blog.ts` | **Create** (server-only blog parsing/loading helpers) | 2 |
| `app/server/api/blog.ts` | **Create** (route-safe server function wrappers) | 2 |
| `app/routes/blog/$slug.tsx` | **Create** | 3 |
| `app/components/blog/BlogCTABanner.tsx` | **Create** | 3 |
| `app/components/blog/BlogBottomCTA.tsx` | **Create** | 3 |
| `app/components/blog/BlogPostHeader.tsx` | **Create** | 3 |
| `app/routes/blog/index.tsx` | **Create** | 4 |
| `app/components/blog/BlogPostCard.tsx` | **Create** | 4 |
| `content/blog/docx-to-markdown-guide.md` | **Create** | 5 |
| `content/blog/djvu-to-pdf-guide.md` | **Create** | 5 |
| `content/blog/latex-to-pdf-guide.md` | **Create** | 5 |
| `content/blog/epub-vs-mobi.md` | **Create** | 5 |
| `app/routes/api/sitemap[.]xml.tsx` | Modify (add blog URLs) | 6 |
| `app/components/layout/Header.tsx` | Modify (add Blog link) | 7 |
| `app/styles/globals.css` | Modify (integrate typography plugin) | 8 |
| `tests/unit/blog.test.ts` | **Create** | 9 |
| `tests/integration/blog-routes.test.ts` | **Create** | 9 |

---

## Dependency Graph

```
Step 1 (Dependencies)
  |
  v
Step 2 (Server-only Blog Data Layer)
  |
  ├──> Step 3 (Blog Post Route + Components)
  |      |
  |      v
  |    Step 5 (Blog Content — 4 posts)
  |
  ├──> Step 4 (Blog Index Route + Card)
  |
  ├──> Step 6 (Sitemap Update) — needs Step 2
  |
  v
Step 7 (Header Nav) — independent, can parallel with 3-6
Step 8 (Typography) — independent, can parallel with 3-7
Step 9 (Testing & Verification) — requires all above
```

Steps 3, 4, 6, 7, and 8 are largely independent of each other once Step 2 is done.

---

## Separate Ops Task: Docker HEALTHCHECK

This is intentionally out of scope for the main blog rollout above.

- **Modify:** `Dockerfile`
- Add `curl` only if the base image does not already provide it
- Add:
  ```dockerfile
  HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1
  ```
- Uses the existing `/api/health` endpoint (returns `{ status: 'ok' }`)
- Verify separately with:
  - `docker build .`
  - container health status reaches `healthy`
