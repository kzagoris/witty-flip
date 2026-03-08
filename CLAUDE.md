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

### Implementation Status

- **Phase 1 (Foundation):** Complete — conversions registry, file validation, rate limiting, converter interface, queue, Stripe integration, ESLint, Drizzle migrations
- **Phase 2 (Converters):** Not started — actual converter wrappers (pandoc, weasyprint, etc.)
- **Phase 3+ (API, UI, SEO):** Not started

### Key Modules

| Module | File | Notes |
|--------|------|-------|
| Conversion definitions | `app/lib/conversions.ts` | 7 types with SEO/FAQ data, lookup by slug |
| File validation | `app/lib/file-validation.ts` | Magic bytes (DjVu header), ZIP-based, UTF-8 text |
| Rate limiting | `app/lib/rate-limit.ts` | IP + UTC date, 2 free/day |
| Converter registry | `app/lib/converters/index.ts` | `Converter` interface with AbortSignal |
| Queue | `app/lib/queue.ts` | Max 5 concurrent, 30s timeout, re-entrant guard |
| Stripe | `app/lib/stripe.ts` | Checkout, webhook verification, idempotent handler |

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
