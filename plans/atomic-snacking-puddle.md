# Docker HEALTHCHECK Implementation Plan

## Context

Phases 1–5 are complete. The blog system has shipped. This is the separate ops follow-up task called out in `plans/BLOG-IMPLEMENTATION.md` (lines 480–495): add a Docker `HEALTHCHECK` directive so the container reports its health status and Docker can restart it automatically on failure.

The `/api/health` endpoint already exists and returns `{ status: "ok" }` with HTTP 200.

---

## Step 1: Add `curl` to the Dockerfile apt-get install

**File:** `Dockerfile`

Add `curl` to the existing `apt-get install -y` block (alphabetical order):

```dockerfile
RUN apt-get update && apt-get install -y \
    calibre \
    curl \
    djvulibre-bin \
    libreoffice-writer \
    pandoc \
    texlive-latex-base \
    texlive-fonts-recommended \
    weasyprint \
    && rm -rf /var/lib/apt/lists/*
```

---

## Step 2: Add the HEALTHCHECK directive

**File:** `Dockerfile`

Add the `HEALTHCHECK` instruction before the `CMD` line:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1
```

Parameters:
- `--interval=30s` — check every 30 seconds
- `--timeout=5s` — fail if no response within 5 seconds
- `--start-period=10s` — grace period for app startup before health checks count
- `--retries=3` — mark unhealthy after 3 consecutive failures
- `curl -f` — fail silently on HTTP errors (returns non-zero exit code on 4xx/5xx)

---

## Final Dockerfile (after changes)

```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y \
    calibre \
    curl \
    djvulibre-bin \
    libreoffice-writer \
    pandoc \
    texlive-latex-base \
    texlive-fonts-recommended \
    weasyprint \
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

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", ".output/server/index.mjs"]
```

---

## Verification

1. `docker build .` — image builds successfully
2. `docker run -d --name wittyflip-test <image>` — container starts
3. `docker inspect --format='{{.State.Health.Status}}' wittyflip-test` — status reaches `healthy` within ~40 seconds (start-period + first successful check)
4. Verify health check log: `docker inspect --format='{{json .State.Health}}' wittyflip-test` shows recent successful checks
5. Existing tests still pass: `npm test`
