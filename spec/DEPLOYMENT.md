# WittyFlip Deployment Guide

This guide covers deploying WittyFlip to a Hetzner VPS with Docker and Caddy reverse proxy, as described in `SPEC.md`.

## Architecture Overview

```
Internet
  |
  | HTTPS (443) / HTTP (80, redirects to HTTPS)
  |
Caddy (auto SSL via Let's Encrypt)
  |
  | reverse_proxy :3000
  |
Node.js App (TanStack Start SSR + API)
  |
  |-- SQLite (./data/sqlite.db)
  |-- Temp files (./data/conversions/)
  |-- Conversion tools (pandoc, weasyprint, djvulibre, calibre, pdflatex, libreoffice)
```

## Prerequisites

- A VPS with Ubuntu 22.04+ (Hetzner CX22 or similar, $5-10/mo)
- A domain name pointed to the VPS IP (e.g., `wittyflip.com`)
- SSH access to the VPS
- A Stripe account with API keys
- A GitHub repository for the project

## 1. VPS Initial Setup

### Connect and update

```bash
ssh root@YOUR_VPS_IP

apt-get update && apt-get upgrade -y
```

### Create a deploy user (do not run the app as root)

```bash
adduser deploy
usermod -aG sudo deploy
```

Copy your SSH key to the deploy user:

```bash
su - deploy
mkdir -p ~/.ssh
# Paste your public key into authorized_keys
nano ~/.ssh/authorized_keys
chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
```

### Install Docker

```bash
# As deploy user (or root)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker deploy
# Log out and back in for group change to take effect
```

Verify: `docker --version && docker compose version`

### Install Git

```bash
sudo apt-get install -y git
```

### Configure firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 2. DNS Configuration

Point your domain to the VPS IP address:

| Record | Name | Value |
|--------|------|-------|
| A | `@` | `YOUR_VPS_IP` |
| A | `www` | `YOUR_VPS_IP` |

Caddy requires DNS to be properly configured before it can issue SSL certificates. Allow a few minutes for DNS propagation.

Verify: `dig +short wittyflip.com` should return your VPS IP.

## 3. Clone the Repository

```bash
ssh deploy@YOUR_VPS_IP

cd ~
git clone https://github.com/kzagoris/witty-flip.git
cd witty-flip
```

## 4. Configure Environment Variables

Create the production environment file:

```bash
cp .env.example .env.production
nano .env.production
```

Set the following values:

```env
# Database (default path, no change needed unless customizing)
DATABASE_URL=file:./data/sqlite.db

# Stripe (get from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Public URL (your domain, used for Stripe redirect URLs)
BASE_URL=https://wittyflip.com

# Trusted proxy CIDRs — Caddy runs in the Docker network
# The app container sees Caddy's Docker bridge IP as the peer
TRUSTED_PROXY_CIDRS=172.16.0.0/12,192.168.0.0/16,10.0.0.0/8
```

**Security notes:**
- Never commit `.env.production` to the repository (it is gitignored)
- Use `sk_live_` keys for production, not `sk_test_`
- The `TRUSTED_PROXY_CIDRS` covers Docker's default bridge network ranges so the app trusts `X-Forwarded-For` headers from Caddy

## 5. Configure Caddy

Edit the Caddyfile to match your domain:

```bash
nano Caddyfile
```

Current contents:

```
wittyflip.com {
    reverse_proxy app:3000
}
```

Update `wittyflip.com` to your actual domain if different. Caddy automatically:
- Obtains and renews Let's Encrypt SSL certificates
- Redirects HTTP to HTTPS
- Serves HTTP/2 and HTTP/3
- Sets `X-Forwarded-For` and `X-Forwarded-Proto` headers

For additional security headers (recommended), expand the Caddyfile:

```
wittyflip.com {
    reverse_proxy app:3000

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }
}
```

## 6. Prepare Data Directories

```bash
mkdir -p data/conversions
```

The SQLite database will be created automatically when migrations run.

## 7. Build and Start

### First deployment

```bash
docker compose --env-file .env.production up --build -d
```

This builds the Docker image (installs all conversion tools, runs `npm ci` and `npm run build`) and starts both services.

### Run database migrations

The database migrations need to run inside the app container:

```bash
docker compose exec app npx drizzle-kit migrate
```

### Verify services are running

```bash
# Check container status
docker compose ps

# Check app logs
docker compose logs app --tail 50

# Check Caddy logs
docker compose logs caddy --tail 50

# Test health endpoint
curl -s https://wittyflip.com/api/health
# Expected: {"status":"ok"}
```

## 8. Configure Stripe Webhook

Stripe needs a webhook endpoint to notify the app when payments complete.

1. Go to https://dashboard.stripe.com/webhooks
2. Click **Add endpoint**
3. Set the URL: `https://wittyflip.com/api/webhook/stripe`
4. Select event: `checkout.session.completed`
5. Click **Add endpoint**
6. Copy the **Signing secret** (`whsec_...`) and update `STRIPE_WEBHOOK_SECRET` in `.env.production`
7. Restart the app: `docker compose --env-file .env.production up -d`

## 9. File Cleanup Cron Job

Converted files expire 1 hour after completion. A cron job should clean up expired files every 15 minutes.

The cleanup logic lives in the application (files where `expires_at` has passed get deleted). Set up a cron trigger:

```bash
crontab -e
```

Add:

```
*/15 * * * * cd /home/deploy/witty-flip && docker compose exec -T app node -e "
  // Trigger cleanup via the app's internal logic
  // This is a placeholder — implement as an API endpoint or CLI command
" >> /var/log/wittyflip-cleanup.log 2>&1
```

> **Note:** If the cleanup is built into the app as a `setInterval` (runs automatically while the server is up), no external cron is needed. Check if `queue.ts` or `server-runtime.ts` already handles periodic cleanup.

## 10. Subsequent Deployments

For code updates after the initial deployment:

```bash
ssh deploy@YOUR_VPS_IP
cd ~/witty-flip

# Pull latest code
git pull origin main

# Rebuild and restart (zero-downtime is not guaranteed — expect a few seconds of downtime)
docker compose --env-file .env.production up --build -d

# Run migrations if schema changed
docker compose exec app npx drizzle-kit migrate

# Verify
docker compose ps
curl -s https://wittyflip.com/api/health
```

### Future: GitHub Actions automated deployment

```yaml
# .github/workflows/deploy.yml (example, not yet implemented)
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: deploy
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd ~/witty-flip
            git pull origin main
            docker compose --env-file .env.production up --build -d
            docker compose exec -T app npx drizzle-kit migrate
```

## 11. Monitoring

### Docker-level monitoring

```bash
# Live logs
docker compose logs -f

# Resource usage
docker stats

# Disk usage
df -h /home/deploy/witty-flip/data
du -sh /home/deploy/witty-flip/data/conversions/
```

### Uptime monitoring

Set up a free UptimeRobot monitor (https://uptimerobot.com):

- **URL:** `https://wittyflip.com/api/health`
- **Interval:** 5 minutes
- **Alert:** Email on downtime

### Application logs

```bash
# App logs (last 100 lines)
docker compose logs app --tail 100

# Follow app logs live
docker compose logs app -f

# Filter for errors
docker compose logs app 2>&1 | grep -i error
```

## 12. Maintenance

### Restart services

```bash
cd ~/witty-flip
docker compose --env-file .env.production restart
```

### Full rebuild (e.g., after Dockerfile changes)

```bash
docker compose --env-file .env.production down
docker compose --env-file .env.production up --build -d
```

### View/query the database

```bash
# Open a shell in the container
docker compose exec app sh

# Use drizzle-kit studio (if available) or sqlite3 directly
# The DB is also accessible on the host at ./data/sqlite.db
sqlite3 data/sqlite.db "SELECT count(*) FROM conversions;"
```

### Backup the database

```bash
# Simple copy (safe because SQLite is single-writer)
cp data/sqlite.db data/sqlite.db.backup.$(date +%Y%m%d)

# Or use SQLite's built-in backup command
sqlite3 data/sqlite.db ".backup data/sqlite.db.backup.$(date +%Y%m%d)"
```

Consider a daily cron for automated backups:

```bash
crontab -e
```

```
0 3 * * * cp /home/deploy/witty-flip/data/sqlite.db /home/deploy/witty-flip/data/backups/sqlite.db.$(date +\%Y\%m\%d)
```

### Disk space management

If disk space runs low:

```bash
# Check what's using space
du -sh data/conversions/

# Prune old Docker images
docker image prune -af

# Prune Docker build cache
docker builder prune -af
```

### Update system packages inside Docker

Rebuild the image to pull the latest OS packages:

```bash
docker compose --env-file .env.production build --no-cache
docker compose --env-file .env.production up -d
```

## 13. Troubleshooting

### Caddy can't obtain SSL certificate

- Verify DNS is pointed to the VPS: `dig +short wittyflip.com`
- Ensure ports 80 and 443 are open: `sudo ufw status`
- Check Caddy logs: `docker compose logs caddy`
- Caddy uses the ACME HTTP-01 challenge — port 80 must be reachable

### App crashes on startup

```bash
docker compose logs app --tail 50
```

Common causes:
- Missing environment variables (check `.env.production`)
- Database migration not run (`docker compose exec app npx drizzle-kit migrate`)
- Port conflict (another service on port 3000)

### Conversions fail

```bash
# Check if conversion tools are installed in the container
docker compose exec app pandoc --version
docker compose exec app weasyprint --version
docker compose exec app ddjvu --help
docker compose exec app ebook-convert --version
docker compose exec app pdflatex --version
docker compose exec app libreoffice --version
```

### Container runs out of memory

The default Hetzner CX22 has 4GB RAM. LibreOffice and Calibre are memory-hungry. If OOM kills occur:

- Check: `docker compose logs app | grep -i "killed"`
- Add memory limits in `docker-compose.yml`:

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          memory: 3G
```

- Or upgrade the VPS

### Stripe webhooks not arriving

- Verify the webhook URL in Stripe Dashboard: `https://wittyflip.com/api/webhook/stripe`
- Check the webhook signing secret matches `STRIPE_WEBHOOK_SECRET`
- Check Stripe Dashboard > Webhooks > Recent attempts for error details
- Test with Stripe CLI: `stripe listen --forward-to https://wittyflip.com/api/webhook/stripe`

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | No | `file:./data/sqlite.db` | SQLite database path |
| `STRIPE_SECRET_KEY` | Yes | — | Stripe API secret key (`sk_live_...` or `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Yes | — | Stripe webhook signing secret (`whsec_...`) |
| `BASE_URL` | Yes | `http://localhost:3000` | Public URL for Stripe redirects and canonical URLs |
| `TRUSTED_PROXY_CIDRS` | No | `127.0.0.1/32,::1/128` | Comma-separated CIDRs of trusted reverse proxies |
| `NODE_ENV` | No | — | Set to `production` in Docker Compose |
| `METRICS_API_KEY` | No | — | Bearer token for `/metrics` endpoint (Phase 5) |

## Quick Reference

```bash
# First deploy
git clone https://github.com/kzagoris/witty-flip.git && cd witty-flip
cp .env.example .env.production && nano .env.production
mkdir -p data/conversions
docker compose --env-file .env.production up --build -d
docker compose exec app npx drizzle-kit migrate

# Update deploy
cd ~/witty-flip && git pull origin main
docker compose --env-file .env.production up --build -d

# Logs
docker compose logs -f app

# Status
docker compose ps && curl -s https://wittyflip.com/api/health
```
