---
feature: uptime_monitoring
defaultStatus: deployed
stage: 3
---

# Sites (Uptime) — bundled with analytic_audit

Uptime is part of the **Sites** module (`analytic_audit`). Enabling Sites turns on `uptime_monitoring` automatically. Do not sell or list this feature alone.

See [../analytic-audit/DEPLOY.md](../analytic-audit/DEPLOY.md) for the full Sites playbook.

## Required env vars

- `UPTIMEROBOT_API_KEY` — from UptimeRobot Integrations → API
- `UPTIMEROBOT_WEBHOOK_SECRET` — long random string for webhook auth
- `UPTIMEROBOT_POLL_SECRET` — optional; defaults to webhook secret for cron poll

## Checklist

- [ ] Set `UPTIMEROBOT_*` on Astro service
- [ ] Configure webhook → `/api/uptime/webhook?key=<secret>`
- [ ] Verify monitor status on the Sites dashboard cards
