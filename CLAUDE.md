# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WittyFlip is an online document conversion service (DOCX→Markdown, DJVU→PDF, etc.) targeting organic search traffic. Freemium model: 2 free conversions/day per IP, then $0.49/file via Stripe. The full specification lives in `spec/SPEC.md`.

## Tech Stack

- **Framework:** TanStack Start (React, SSR, Vite-based)
- **Styling:** Tailwind CSS + shadcn/ui
- **Database:** SQLite + Drizzle ORM
- **Payments:** Stripe Checkout (guest mode, no accounts)
- **Conversion tools:** Pandoc, LibreOffice, djvulibre, Calibre, weasyprint, texlive
- **Deployment:** Docker + Caddy reverse proxy on Hetzner VPS

## Commands

```bash
npm install              # Install dependencies
npm run dev              # Dev server with HMR
npm run build            # Production build
npm run type-check       # TypeScript checking
npm run lint             # Linting
npm run db:generate      # Generate Drizzle migration from schema
npm run db:migrate       # Run Drizzle migrations
docker compose up        # Run full stack (app + Caddy)
docker compose --env-file .env.production up --build -d  # Production deploy
```

## Architecture

### Conversion Pipeline

```
Upload (POST /api/upload) → Rate Limit Check (POST /api/convert) → [Payment if needed] → Queue → Convert → Download (1hr window) → Cleanup
```

- Upload is always free/fast; rate limiting happens at the convert step
- Failed conversions do not consume free quota; paid conversions bypass it entirely
- DB-backed queue with max 5 concurrent conversion jobs
- Files stored as `{uuid}.{ext}`, never using user-provided filenames
- Converted files expire 1 hour after completion; cron cleans up every 15 minutes

### Database Tables

Three tables in SQLite via Drizzle ORM (`app/lib/db/schema.ts`):

- **conversions** — job tracking with status lifecycle: `uploaded → payment_required/pending_payment → queued → converting → completed/failed/timeout/expired`
- **rate_limits** — IP + date tracking for daily free quota
- **payments** — Stripe session/payment records linked to conversions

### Routing

- `/$conversionType` — dynamic SSR landing page per conversion (e.g., `/docx-to-markdown`)
- `/blog/$slug` — blog posts for SEO long-tail keywords
- API routes under `app/server/api/`: upload, convert, conversion-status, download, create-checkout, webhook/stripe

### Converter Registry

Each conversion tool has a wrapper in `app/lib/converters/` (pandoc.ts, libreoffice.ts, etc.) registered through `app/lib/converters/index.ts`. Conversions run as child processes with 30-second timeout and dropped Linux capabilities.

### Converter Wrappers

Six converters in `app/lib/converters/`, each using shared infrastructure:

- **Shared:** `spawn-helper.ts` (subprocess with AbortSignal), `converter-run.ts` (common convert logic), `sanitize-error.ts` (path redaction + ANSI stripping), `register-all.ts` (idempotent bootstrap)
- **pandoc.ts** — DOCX→MD, MD→PDF (via weasyprint engine), ODT→DOCX
- **djvulibre.ts** — DJVU→PDF via `ddjvu`
- **calibre.ts** — EPUB→MOBI via `ebook-convert`
- **weasyprint.ts** — HTML→PDF with `--base-url /dev/null` (runtime `--network=none` needed for full SSRF protection)
- **pdflatex.ts** — LaTeX→PDF with temp working dir, extracts `!`-prefixed error lines
- **libreoffice.ts** — ODT→DOCX fallback, unique temp profile per invocation

### API Routes

**Server functions** (TanStack `createServerFn` in `app/server/api/`):

- `upload.ts` — `POST /api/upload` (FormData): validate, save file, insert DB row
- `convert.ts` — `POST /api/convert` ({ fileId }): rate-limit check, atomic slot reservation, enqueue or return 402
- `conversion-status.ts` — `GET /api/conversion/{fileId}/status`: poll status, check artifact/expiry
- `rate-limit-status.ts` — `GET /api/rate-limit-status`: remaining free conversions for IP
- `create-checkout.ts` — `POST /api/create-checkout` ({ fileId }): create/reuse Stripe session

**File-based route handlers** (`app/routes/api/`):

- `download/$fileId.tsx` — `GET /api/download/{fileId}`: stream file with Content-Disposition
- `webhook/stripe.tsx` — `POST /api/webhook/stripe`: verify signature, handle `checkout.session.completed`
- `health.tsx` — `GET /api/health`: returns `{ status: 'ok' }`

**Shared:** `contracts.ts` (response types, status helpers, UUID validation), `status-utils.ts` (status payload builder)

### Request Throttling

`app/lib/request-rate-limit.ts` — in-memory bucket throttle: 10 req/min/IP, applied to all public API endpoints. Separate from the daily free-conversion quota in `rate-limit.ts`.

### Implementation Status

- **Phase 1 (Foundation):** Complete — conversions registry, file validation, rate limiting, converter interface, queue, Stripe integration, ESLint, Drizzle migrations
- **Phase 2 (Converters):** Complete — all 6 converter wrappers with shared spawn/error infrastructure
- **Phase 3 (API Routes):** Complete — all API endpoints, request throttling, Stripe webhook, download streaming, health check
- **Phase 4+ (UI, Blog, SEO, Observability):** Not started

### Testing

170 tests across 15 files (Vitest, Node environment):

- **Unit tests** (`tests/unit/`): converters, rate limiting, IP resolution, file validation, queue, Stripe, conversions registry
- **Integration tests** (`tests/integration/api.test.ts`): full upload→convert→poll→download flows, rate limiting, paid conversion, webhook idempotency
- **Helpers:** `tests/helpers/create-test-app.ts` (HTTP harness via supertest), `tests/helpers/test-env.ts` (sandbox isolation, temp dirs, DB reset)

### Key Modules

| Module                 | File                            | Notes                                                |
| ---------------------- | ------------------------------- | ---------------------------------------------------- |
| Conversion definitions | `app/lib/conversions.ts`        | 7 types with SEO/FAQ data, lookup by slug            |
| File validation        | `app/lib/file-validation.ts`    | Magic bytes (DjVu header), ZIP-based, UTF-8 text     |
| Rate limiting          | `app/lib/rate-limit.ts`         | Atomic reservation model, 2 free/day per IP          |
| Request throttling     | `app/lib/request-rate-limit.ts` | 10 req/min/IP, in-memory buckets                     |
| IP resolution          | `app/lib/request-ip.ts`         | Trusted-proxy X-Forwarded-For, IPv4/v6 normalization |
| Converter registry     | `app/lib/converters/index.ts`   | `Converter` interface with AbortSignal               |
| Queue                  | `app/lib/queue.ts`              | Max 5 concurrent, 30s timeout, re-entrant guard      |
| Stripe                 | `app/lib/stripe.ts`             | Checkout, webhook verification, idempotent handler   |
| File paths             | `app/lib/conversion-files.ts`   | Canonical `data/conversions/{uuid}.{ext}` paths      |
| Server init            | `app/lib/server-runtime.ts`     | Centralized converter registration                   |
| API contracts          | `app/server/api/contracts.ts`   | Shared types, status helpers, UUID validation        |

## Security Constraints

- Magic byte validation (not just file extensions) via `file-type` package
- 10MB file size limit
- UUID-based file naming (no user input in disk paths)
- Conversion subprocess runs with `--cap-drop=ALL`
- HTML→PDF runs with no network access (SSRF protection)
- Stripe webhook signature verification required before starting paid conversions

## Git Commit Preferences

- Never include `Co-Authored-By` trailers in commit messages.

## Workflow Preferences

- Never create git worktrees. Always implement changes directly in the current repository.
- Never create pull requests. All work happens directly on the main branch.
- When fixing a bug, add or update a test in the same implementation so the regression is covered.
