---
feature: email_inbox
status: deployed
stage: 2
title: Inbox Triage
---

# Inbox Triage

Resend inbound webhook → admin **Inbox** tab, classification, and project routing.

## Checklist

- `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` on the Railway service
- Inbound domain / receiving address configured in Resend
- Webhook URL: `https://{domain}/api/email/inbound`
- Transactional webhook (delivery + bounce): `https://{domain}/api/webhooks/resend` with `email.delivered`, `email.bounced`, `email.complained` — run `npx tsx scripts/wire-resend-transactional-webhook.ts https://{domain}` or add in Resend dashboard. Sent tab shows **Delivered** when the recipient MTA accepts the message.
- Enable **Inbox Triage** (`email_inbox`) in install `features[]` (deploy baseline) and/or owner **Add-ons** toggle (runtime)
