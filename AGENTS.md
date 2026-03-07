# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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

## Security Constraints

- Magic byte validation (not just file extensions) via `file-type` package
- 10MB file size limit
- UUID-based file naming (no user input in disk paths)
- Conversion subprocess runs with `--cap-drop=ALL`
- HTML→PDF runs with no network access (SSRF protection)
- Stripe webhook signature verification required before starting paid conversions

## Git Commit Preferences

- Never include `Co-Authored-By` trailers in commit messages.
