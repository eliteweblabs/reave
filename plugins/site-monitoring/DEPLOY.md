---
feature: site_monitoring
defaultStatus: deployed
stage: 3
---

# Site monitoring deployment

## Sibling services

- None — integrates with ChangeDetection.io (self-hosted or SaaS)

## Required env vars

- `CHANGEDETECTION_BASE_URL` — ChangeDetection.io instance URL
- `CHANGEDETECTION_API_KEY` — API key for watch management
- `CHANGEDETECTION_WEBHOOK_SECRET` — auth for inbound change webhooks

## External setup

- Enable `site_monitoring` in install config `features[]`
- Deploy or subscribe to ChangeDetection.io
- Point watch webhooks to Reave `/api/changedetection/webhook?key=`

## Checklist

- [ ] Set `CHANGEDETECTION_*` on Astro service
- [ ] Create a test watch and confirm webhook delivery
- [ ] Verify change alerts appear in admin
- [ ] Set `moduleStatus.site_monitoring` → `deployed` in install config
