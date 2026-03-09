# Phase 4: UI Implementation Plan

## Context

Phases 1-3 (Foundation, Converters, API Routes) are complete with 170 passing tests. All backend endpoints work. The current frontend consists entirely of stub/placeholder components and minimal route files. This plan implements the full user-facing UI: homepage with conversion cards, conversion landing pages with upload-to-download flow, SEO meta tags, and Stripe payment integration.

## User Decisions

- **Scope**: Full conversion page + homepage (no blog, no ads)
- **Components**: shadcn/ui (new-york style)
- **Animations**: Essential only (progress bars, transitions, loading states)
- **Convert flow**: Auto-convert after upload
- **Polling**: Simple 1.5s interval while queued/converting
- **Homepage**: Responsive grid of colorful cards (3/2/1 cols)
- **Quota**: Always show remaining free conversions badge
- **Errors**: Styled error card with retry button
- **Typography**: Inter (body) + Plus Jakarta Sans (headings) via Google Fonts
- **Logo**: Text-based "WittyFlip" in vibrant purple

## Implementation Adjustments

- Keep route loaders and route components safe for both SSR and client navigation. Do not directly import request-bound server helpers like `processRateLimitStatus()` into route files.
- Keep client bundles lean by separating lightweight conversion summary data (slug, labels, colors) from full SEO page content (`seoContent`, FAQs, related links).
- Make `useConversionFlow()` the single owner of the upload -> convert -> poll -> checkout state machine; keep presentational components thin.
- Treat Stripe cancel/return states and request-rate-limit responses as first-class UI states, not edge cases.

---

## Build Order

### Step 0: Route/Data Architecture Prep

**Actions:**
1. Refactor conversion metadata so navigation/card UIs do not import full SEO HTML and FAQ payloads:
   - Either split `app/lib/conversions.ts` into summary/detail modules, or
   - Add summary helpers/types for header, homepage, and related conversions
2. Keep full page-level content accessible for `/$conversionType` loader/head generation only
3. Decide a single client-safe data shape for:
   - Header dropdown
   - Homepage grid
   - Related conversions

**Why first:**
- Prevents unnecessary client bundle growth before building UI components that consume conversion data.

### Step 1: shadcn/ui + Tailwind Theme Setup

**Actions:**
1. Run `npx shadcn@latest init` with config:
   - Style: new-york, RSC: false, TSX: true
   - CSS: `app/styles/globals.css`, aliases: `~/components`, `~/lib`, `~/components/ui`
2. Install components: `button card progress badge accordion alert dropdown-menu separator`
3. Expand `app/styles/globals.css` with:
    - `@theme` block: brand purple scale, format accent colors, font families, animation keyframes (fade-in, slide-up, progress shimmer)
    - shadcn CSS variables (`:root` block with purple as primary/ring)
    - Base styles: body font-family, heading font-family
    - Typography/prose styling for SEO content sections
4. Add Google Fonts `<link>` tags (Inter + Plus Jakarta Sans) to `app/routes/__root.tsx` head

**Files to create:**
- `components.json` (shadcn CLI)
- `app/lib/utils.ts` (shadcn CLI — `cn()` helper)
- `app/components/ui/*.tsx` (shadcn CLI — ~9 primitives)

**Files to modify:**
- `app/styles/globals.css` — expand from `@import 'tailwindcss'` to full theme
- `package.json` — new deps added by shadcn CLI

### Step 2: Root Layout + Header/Footer

**Actions:**
1. Update `app/routes/__root.tsx`:
   - Import `globals.css` via `import '~/styles/globals.css'`
   - Add Google Fonts preconnect + stylesheet `<link>` tags in `head()`
   - Add body classes: `min-h-screen flex flex-col bg-white text-neutral-900 antialiased`
   - Wrap `<Outlet />` with Header + Footer
2. Create `app/components/layout/Header.tsx`:
   - Text logo "WittyFlip" in brand purple (bold, font-heading)
   - "All Conversions" dropdown using shadcn DropdownMenu
   - Data: import `getAllConversionTypes()` from `~/lib/conversions` (static data, safe for client)
   - Navigation: `Link` from `@tanstack/react-router` to each `/$slug`
3. Create `app/components/layout/Footer.tsx`:
   - Copyright, trust signal text
4. Create `app/components/layout/PageShell.tsx`:
   - `<main>` with `max-w-5xl mx-auto px-4 py-8` responsive container

**Files to modify:**
- `app/routes/__root.tsx`

**Files to create:**
- `app/components/layout/Header.tsx`
- `app/components/layout/Footer.tsx`
- `app/components/layout/PageShell.tsx`

**Delete old stubs:**
- `app/components/Header.tsx`
- `app/components/Footer.tsx`
- `app/components/SEOHead.tsx`
- `app/components/AdBanner.tsx`

**Checkpoint:** Dev server shows styled header/footer on all pages.

### Step 3: Homepage

**Actions:**
1. Create `app/components/home/HeroSection.tsx`:
   - Gradient purple background, "WittyFlip" heading, tagline, value proposition
2. Create `app/components/home/ConversionCard.tsx`:
   - Props: `{ conversion: ConversionType }`
   - shadcn Card with format-color accent border/badge
   - Source->Target label, brief description, Link to `/$slug`
3. Create `app/components/home/ConversionGrid.tsx`:
   - Props: `{ conversions: ConversionType[] }`
   - CSS grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6`
4. Update `app/routes/index.tsx`:
   - Add `loader` returning `getAllConversionTypes()`
   - Override `head()` with homepage title/description/OG tags
   - Render HeroSection + ConversionGrid in PageShell

**Files to create:**
- `app/components/home/HeroSection.tsx`
- `app/components/home/ConversionCard.tsx`
- `app/components/home/ConversionGrid.tsx`

**Files to modify:**
- `app/routes/index.tsx`

**Delete old stub:**
- `app/components/ConversionCard.tsx`

**Checkpoint:** Homepage shows colorful grid of 7 conversion types with working links.

### Step 4: Conversion Page — Static Sections

**Actions:**
1. Create `app/lib/structured-data.ts`:
    - `buildFAQPageSchema(faqs)` — JSON-LD FAQPage
    - `buildSoftwareAppSchema(conversion)` — JSON-LD SoftwareApplication
    - Only add `buildHowToSchema(conversion)` if a visible on-page How It Works section is added; otherwise skip it to keep structured data aligned with rendered content
2. Create `app/components/conversion/ConversionHero.tsx`:
   - Props: `{ conversion: ConversionType }`
   - Gradient background using `conversion.formatColor` as accent
   - `<h1>` from `conversion.seo.h1`
3. Create `app/components/conversion/SEOContent.tsx`:
   - Props: `{ html: string }`
   - Renders the developer-authored seoContent HTML (from `conversions.ts`, not user input) in prose-styled container
   - Trust signal: "Files are deleted 1 hour after conversion"
   - Note: Content is hardcoded in the codebase, not user-supplied — safe to render as HTML
4. Create `app/components/conversion/FAQSection.tsx`:
   - Props: `{ faqs: ConversionFAQ[] }`
   - shadcn Accordion, each FAQ as AccordionItem
5. Create `app/components/conversion/RelatedConversions.tsx`:
   - Props: `{ slugs: string[] }`
   - Row of mini ConversionCards using `getConversionBySlug()` to resolve slugs
6. Update `app/routes/$conversionType.tsx`:
    - Add `loader`: call `getConversionBySlug(params.conversionType)`, throw `notFound()` if undefined
    - Add `head()`: title, description, keywords, OG tags, JSON-LD structured data from `structured-data.ts`
    - Add explicit invalid-slug/not-found UX so unsupported conversions render a clear 404 state
    - Render ConversionHero, SEOContent, FAQSection, RelatedConversions in PageShell

**Files to create:**
- `app/lib/structured-data.ts`
- `app/components/conversion/ConversionHero.tsx`
- `app/components/conversion/SEOContent.tsx`
- `app/components/conversion/FAQSection.tsx`
- `app/components/conversion/RelatedConversions.tsx`

**Files to modify:**
- `app/routes/$conversionType.tsx`

**Checkpoint:** `/docx-to-markdown` renders full page with hero, SEO content, FAQ, related conversions.

### Step 5: File Upload

**Actions:**
1. Create `app/lib/api-client.ts`:
   - `callServerFn<T>(fn, data?)` — wraps server function calls, catches errors from `setResponseStatus(4xx)`, returns `{ ok: true, data: T } | { ok: false, error: ApiErrorResponse }`
   - This handles the TanStack Start behavior where `setResponseStatus(4xx)` causes client-side throws
2. Create `app/components/conversion/FileUploader.tsx`:
    - Props: `{ sourceExtensions, sourceMimeTypes, maxSizeMB, onFileSelected, disabled? }`
    - Drag-and-drop zone: `onDragOver`/`onDragLeave`/`onDrop` + hidden `<input type="file">`
    - Visual states: idle (dashed border, file icon), dragging (color change, scale), uploading (progress indicator)
    - Client-side file size check (10MB)
    - Emits the selected `File` to the hook layer; does not own the server call or conversion state machine

**Existing code to reuse:**
- `uploadFile` from `~/server/api/upload` — `createServerFn({ method: 'POST' })`, expects FormData with 'file' and 'conversionType' fields
- `MAX_FILE_SIZE` from `~/lib/file-validation` (10MB) — for client-side pre-check display

**Files to create:**
- `app/lib/api-client.ts`
- `app/components/conversion/FileUploader.tsx`

**Delete old stub:**
- `app/components/FileUploader.tsx`

**Checkpoint:** File upload works, returns fileId.

### Step 6: Conversion Flow + Polling

**Actions:**
1. Create `app/hooks/usePolling.ts`:
   - `usePolling(fn, intervalMs, enabled)` — calls `fn` every `intervalMs` while `enabled` is true, cleans up on unmount
2. Create `app/hooks/useConversionFlow.ts`:
    - Encapsulates the full conversion state machine
    - States: `idle | uploading | converting | completed | payment_required | pending_payment | failed | timeout | expired`
    - Actions: `startUpload(file)`, `reset()`, `startCheckout()`
    - On mount with `initialFileId` (from URL search params): resume polling
    - Owns the upload call: `uploadFile(FormData)` -> `convertFile({ data: { fileId } })`
    - Polls `getConversionStatus({ data: { fileId } })` every 1.5s while queued/converting/pending_payment
    - Adds backoff / retry behavior for transient errors and 429 responses
    - Pauses polling while the document is hidden and resumes on visibility change
    - Handles `completed` responses that are missing `downloadUrl` as a recoverable error state, not a success screen
    - Returns: `{ state, fileId, status, error, startUpload, reset, startCheckout }`
3. Create `app/components/conversion/ConversionProgress.tsx`:
   - Props: `{ status: ConversionJobStatus, progress: number, message?: string }`
   - shadcn Progress bar with smooth CSS transition on value changes
   - Status text below bar
4. Create `app/components/conversion/ConversionStatus.tsx`:
    - Props: `{ status: ConversionStatusResponse, onReset, onStartCheckout }`
    - Delegates rendering based on `status.status`:
      - `queued`/`converting` -> ConversionProgress
      - `completed` with `downloadUrl` -> DownloadSection
      - `completed` without `downloadUrl` -> ErrorCard
      - `payment_required` -> PaymentPrompt
      - `pending_payment` -> ConversionProgress with "Processing payment..." message
      - `failed`/`timeout`/`expired` -> ErrorCard

**Existing code to reuse:**
- `convertFile` from `~/server/api/convert` — expects `{ fileId: string }`
- `getConversionStatus` from `~/server/api/conversion-status` — GET, expects `{ fileId: string }`
- `ConversionStatusResponse` and `ConversionJobStatus` from `~/server/api/contracts`
- `statusToProgress()` from `~/server/api/contracts` — maps status to 0-100

**Files to create:**
- `app/hooks/usePolling.ts`
- `app/hooks/useConversionFlow.ts`
- `app/components/conversion/ConversionProgress.tsx`
- `app/components/conversion/ConversionStatus.tsx`

**Delete old stub:**
- `app/components/ConversionProgress.tsx`

### Step 7: Download + Error + Quota

**Actions:**
1. Create `app/components/conversion/DownloadSection.tsx`:
   - Props: `{ downloadUrl, expiresAt?, targetFormat, onReset }`
   - Prominent download Button (link to `/api/download/{fileId}`)
   - Expiry countdown text
   - "Convert another file" button calling `onReset`
   - Trust signal: "Your file will be deleted in X minutes"
2. Create `app/components/conversion/ErrorCard.tsx`:
   - Props: `{ errorCode?, message, onRetry? }`
   - shadcn Alert (destructive variant) with error message
   - "Try Again" button calling `onRetry` (which calls `onReset` to return to upload state)
3. Create `app/components/conversion/QuotaBadge.tsx`:
   - Props: `{ remaining, limit }`
   - shadcn Badge: "X/Y free conversions remaining"
   - Color: green when remaining > 0, amber when 0

**Files to create:**
- `app/components/conversion/DownloadSection.tsx`
- `app/components/conversion/ErrorCard.tsx`
- `app/components/conversion/QuotaBadge.tsx`

**Delete old stubs:**
- `app/components/DownloadButton.tsx`

### Step 8: Payment Flow

**Actions:**
1. Create `app/components/conversion/PaymentPrompt.tsx`:
   - Props: `{ fileId, onCheckoutStarted, onError }`
   - shadcn Card: "Free daily limit reached" explanation, "$0.49 per file" price
   - "Pay & Convert" Button
   - Calls `createCheckout({ data: { fileId } })`, redirects to `checkoutUrl` via `window.location.href`
2. Update `app/routes/$conversionType.tsx` to handle Stripe return:
    - Add `validateSearch` for `fileId`, `session_id`, and `canceled` query params
    - When `session_id` + `fileId` present in URL: initialize `useConversionFlow` with `initialFileId` to resume polling
    - When `canceled=true` + `fileId` present: restore payment-required UI with a clear "Checkout canceled" message
    - The Stripe webhook will have set status to `queued`/`converting`/`completed` — polling picks it up

**Existing code to reuse:**
- `createCheckout` from `~/server/api/create-checkout` — expects `{ fileId: string }`, returns `{ checkoutUrl, sessionId, fileId }`

**Files to create:**
- `app/components/conversion/PaymentPrompt.tsx`

**Files to modify:**
- `app/routes/$conversionType.tsx` — add search param validation

**Delete old stub:**
- `app/components/PaymentPrompt.tsx`

### Step 9: Wire Conversion Page Together

**Actions:**
1. Final update to `app/routes/$conversionType.tsx`:
    - Integrate `useConversionFlow` hook
    - Fetch initial rate limit status via the supported server-function path, not by directly importing request-bound server helpers into the route
    - Conditionally render FileUploader (idle state) or ConversionStatus (active state)
    - Pass QuotaBadge with rate limit data
    - Refresh quota immediately after conversion starts, and again on terminal success/failure states
    - Render full page: ConversionHero -> QuotaBadge -> FileUploader/ConversionStatus -> SEOContent -> FAQSection -> RelatedConversions

**Files to modify:**
- `app/routes/$conversionType.tsx` — final integration

**Checkpoint:** Full end-to-end flow works: upload -> auto-convert -> progress -> download (or payment -> Stripe -> return -> download).

### Step 10: Polish

**Actions:**
1. Add smooth CSS transitions on Progress bar value changes
2. Add fade-in animation on component state transitions
3. Verify mobile responsive layout at all breakpoints (320px, 640px, 768px, 1024px)
4. Verify SSR renders meta tags correctly (view page source)
5. Test 404 for invalid conversion slugs
6. Header dropdown styling with format colors
7. Verify Stripe cancel return path (`?fileId=...&canceled=true`)
8. Verify polling pause/resume when tab visibility changes

---

## Key Files Reference

### Existing code to reuse

| What | File | Export |
|------|------|--------|
| Upload server fn | `app/server/api/upload.ts` | `uploadFile` — POST, FormData with 'file' + 'conversionType' |
| Convert server fn | `app/server/api/convert.ts` | `convertFile` — POST, `{ fileId }` |
| Status server fn | `app/server/api/conversion-status.ts` | `getConversionStatus` — GET, `{ fileId }` |
| Rate limit server fn | `app/server/api/rate-limit-status.ts` | `getRateLimitStatus` — GET, no params |
| Checkout server fn | `app/server/api/create-checkout.ts` | `createCheckout` — POST, `{ fileId }` |
| Rate limit server fn | `app/server/api/rate-limit-status.ts` | `getRateLimitStatus` — GET, no params |
| Rate limit internals | `app/server/api/rate-limit-status.ts` | `processRateLimitStatus(clientIp)` — server-only helper, do not import into route files |
| API types | `app/server/api/contracts.ts` | `ConversionJobStatus`, `ConversionStatusResponse`, `UploadResponse`, `CheckoutResponse`, `RateLimitStatusResponse`, `ApiErrorResponse`, `statusToProgress()` |
| Conversion data | `app/lib/conversions.ts` | `ConversionType`, `getConversionBySlug()`, `getAllConversionTypes()`, `ConversionFAQ` |
| File validation | `app/lib/file-validation.ts` | `MAX_FILE_SIZE` (for client-side display) |
| IP resolution | `app/lib/request-ip.ts` | `resolveClientIp()` — for SSR loader |

### All files created (new)

```
components.json
app/lib/utils.ts
app/lib/api-client.ts
app/lib/structured-data.ts
app/hooks/usePolling.ts
app/hooks/useConversionFlow.ts
app/components/ui/    (button, card, progress, badge, accordion, alert, dropdown-menu, separator)
app/components/layout/Header.tsx
app/components/layout/Footer.tsx
app/components/layout/PageShell.tsx
app/components/home/HeroSection.tsx
app/components/home/ConversionCard.tsx
app/components/home/ConversionGrid.tsx
app/components/conversion/ConversionHero.tsx
app/components/conversion/FileUploader.tsx
app/components/conversion/ConversionStatus.tsx
app/components/conversion/ConversionProgress.tsx
app/components/conversion/DownloadSection.tsx
app/components/conversion/PaymentPrompt.tsx
app/components/conversion/ErrorCard.tsx
app/components/conversion/QuotaBadge.tsx
app/components/conversion/SEOContent.tsx
app/components/conversion/FAQSection.tsx
app/components/conversion/RelatedConversions.tsx
```

### All files modified

```
app/styles/globals.css
app/routes/__root.tsx
app/routes/index.tsx
app/routes/$conversionType.tsx
package.json (via shadcn CLI)
```

### All files deleted (old stubs)

```
app/components/Header.tsx
app/components/Footer.tsx
app/components/FileUploader.tsx
app/components/ConversionProgress.tsx
app/components/DownloadButton.tsx
app/components/PaymentPrompt.tsx
app/components/ConversionCard.tsx
app/components/SEOHead.tsx
app/components/AdBanner.tsx
```

---

## Verification

1. **Dev server**: `npm run dev` — pages render at `localhost:3000`
2. **Homepage**: Visit `/` — 7 conversion cards in responsive grid, all links work
3. **Conversion page**: Visit `/docx-to-markdown` — hero, upload area, quota badge, SEO content, FAQ, related conversions all render
4. **Invalid slug**: Visit `/invalid-slug` — returns 404
5. **Upload flow**: Drop a .docx file -> upload progress -> auto-convert -> progress bar -> download button appears (requires Docker for actual conversion tools; without Docker, will reach "converting" then fail — that's expected)
6. **Payment flow**: Exhaust 2 free conversions -> 3rd shows payment prompt -> clicking opens Stripe Checkout (requires `STRIPE_SECRET_KEY`)
7. **Canceled checkout**: Visit the Stripe cancel URL or simulate `?fileId=...&canceled=true` — verify payment UI returns with a clear canceled message
8. **Polling behavior**: Start a conversion, background the tab, then return — verify polling pauses/resumes without spamming requests or getting stuck
9. **SSR check**: View page source on `/docx-to-markdown` — verify meta tags, JSON-LD, and SSR-rendered content
10. **Mobile**: Resize browser to 375px width — verify responsive layout
11. **Existing tests**: `npx vitest run` — all 170 tests still pass (UI changes don't affect backend tests)
12. **Type check**: `npm run type-check` — no TypeScript errors
13. **Lint**: `npm run lint` — no linting errors
