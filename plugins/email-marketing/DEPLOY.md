---
feature: email_marketing
defaultStatus: pending
stage: 3
---

# Email marketing deployment

## Sibling services

- None — uses Resend for outbound email

## Required env vars

- `RESEND_API_KEY` — outbound sends
- `RESEND_FROM` — verified sender address
- `NEWSLETTER_POLL_SECRET` — cron auth for `/api/newsletter/poll?key=`
- `NEWSLETTER_POLL_MINUTES` — optional; default 5
- `NEWSLETTER_SEND_WINDOW_START` / `NEWSLETTER_SEND_WINDOW_END` — optional send hours

## External setup

- Enable `email_marketing` in install config `features[]`
- Verify sending domain in Resend dashboard
- Schedule cron to hit `/api/newsletter/poll?key=<secret>`

## Checklist

- [ ] Set `RESEND_*` and `NEWSLETTER_*` on Astro service
- [ ] Verify Resend domain + webhook (if inbound triage needed)
- [ ] Trigger a test welcome or broadcast email
- [ ] Set `moduleStatus.email_marketing` → `deployed` in install config
