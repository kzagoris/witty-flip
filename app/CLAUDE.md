# app/ — Application Code

## Directory Layout

- `components/` — React UI components (shadcn/ui based)
- `hooks/` — React hooks (`useConversionFlow`, etc.)
- `lib/` — Core business logic (converters, queue, rate-limit, DB, Stripe, blog)
- `routes/` — TanStack Router file-based routes (pages + API handlers)
- `server/api/` — Server functions called from client via RPC
- `styles/` — Tailwind CSS

## Routing Conventions

- `routes/$conversionType.tsx` — Dynamic SSR landing pages (e.g., `/docx-to-markdown`)
- `routes/blog/` — Blog index + `$slug` post pages
- `routes/api/` — File-based HTTP handlers for external consumers

## Server Function Pattern

Server functions in `server/api/` follow a 3-layer pattern:
1. **Core logic** (`processUpload(data, ip)`) — pure, testable
2. **HTTP handler** (`handleUploadHttpRequest(request)`) — for test harness
3. **Server function** (`createServerFn().handler()`) — RPC bridge for client

Client calls use `callServerFn<ResponseType>(fn, data)` from `lib/api-client.ts`.

## File-Based Route Pattern

Routes in `routes/api/` export `Route` via `createFileRoute()` with a `handlers` object.
Used for endpoints consumed by external systems (webhooks, monitoring, file downloads).

## Key Conventions

- Business logic lives in `lib/`, not in routes or server functions
- Lazy dependency loading via `createServerOnlyFn()` (memoized promise pattern)
- IP resolution: `resolveClientIp()` for server fns, `resolveClientIpFromRequest()` for raw requests
- All conversions use UUID-based file paths — never user-provided filenames
