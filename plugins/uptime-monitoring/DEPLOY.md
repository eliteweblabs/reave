---
feature: uptime_monitoring
defaultStatus: pending
stage: 3
---

# Uptime monitoring deployment

## Sibling services

- None — integrates with UptimeRobot API

## Required env vars

- `UPTIMEROBOT_API_KEY` — from UptimeRobot Integrations → API
- `UPTIMEROBOT_WEBHOOK_SECRET` — long random string for webhook auth
- `UPTIMEROBOT_POLL_SECRET` — optional; defaults to webhook secret for cron poll

## External setup

- Enable `uptime_monitoring` in install config `features[]`
- Create UptimeRobot webhook → `/api/uptime/webhook?key=<secret>`
- Disable UptimeRobot email alerts once webhooks are verified

## Checklist

- [ ] Set `UPTIMEROBOT_*` on Astro service
- [ ] Configure webhook integration in UptimeRobot
- [ ] Verify monitor status in admin dashboard
- [ ] Set `moduleStatus.uptime_monitoring` → `deployed` in install config
