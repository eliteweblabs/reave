---
feature: social_lead_scanner
defaultStatus: request
stage: 3
---

# Agentic Social Lead Scanner deployment

Paid add-on. Clients buy it from admin → Modules. Enable in `features[]` after payment.

## Sibling services

- Pairs with **Agentic Social Media** (`social_inbox`) — matched leads also appear in the Social inbox when both modules are on.
- Live platform polling needs reave.app-owned OAuth apps per network (same as social inbox).

## Required env vars

- None for config UI and keyword watchlists.
- **Cron:** `SOCIAL_LEAD_SCANNER_POLL_SECRET` — auth for `GET /api/social-lead-scanner/poll`
- Optional: `SOCIAL_LEAD_SCANNER_POLL_MINUTES` (default 60, min 15, max 720)

## External setup

- Enable `social_lead_scanner` in install config `features[]` after the sale
- Add `social-leads` to `footerNav`
- Set keywords and platforms in admin → Social Leads
- Railway cron: `GET https://{domain}/api/social-lead-scanner/poll?key=$SOCIAL_LEAD_SCANNER_POLL_SECRET`

## Checklist

- [ ] Payment recorded (Modules purchase or invoice)
- [ ] Set `social_lead_scanner` in `features[]`
- [ ] Add `social-leads` to `footerNav` if missing
- [ ] Set `moduleStatus.social_lead_scanner` → `deployed`
- [ ] Configure keywords + enable scheduled scan
- [ ] Set `SOCIAL_LEAD_SCANNER_POLL_SECRET` and Railway cron when adapters go live
