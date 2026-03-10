# WittyFlip Alert Check

Self-contained .NET AOT binary that monitors the WittyFlip application and sends email alerts when thresholds are breached.

## Build

```bash
cd tools/alert-check
dotnet publish -c Release
```

The output binary is at `bin/Release/net9.0/<rid>/publish/alert-check`.

For Linux deployment:

```bash
dotnet publish -c Release -r linux-x64
scp bin/Release/net9.0/linux-x64/publish/alert-check user@vps:/opt/wittyflip/
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `HEALTH_URL` | No | Health endpoint URL (default: `http://localhost:3000/api/health/ready`) |
| `METRICS_URL` | No | Metrics endpoint URL (default: `http://localhost:3000/api/metrics`) |
| `METRICS_API_KEY` | Yes | Bearer token for metrics endpoint |
| `ALERT_EMAIL_TO` | Yes | Recipient email address |
| `ALERT_SMTP_HOST` | Yes | SMTP server hostname |
| `ALERT_SMTP_PORT` | No | SMTP port (default: 587) |
| `ALERT_SMTP_USER` | Yes | SMTP username |
| `ALERT_SMTP_PASS` | Yes | SMTP password |
| `ALERT_EMAIL_FROM` | No | Sender email (default: SMTP user) |
| `ALERT_STATE_FILE` | No | Dedup state file path (default: `data/alert-state.json`) |

## Alert Thresholds

- **app_down**: Health endpoint returns non-200 or is unreachable
- **disk_high**: Disk usage > 80%
- **queue_backlog**: More than 20 queued jobs
- **error_rate_high**: Success rate < 75% in last hour (when conversions > 0)
- **no_recent_success**: No successful conversion in 30+ minutes

## VPS Crontab

```
*/5 * * * * /opt/wittyflip/alert-check >> /var/log/wittyflip-alerts.log 2>&1
```
