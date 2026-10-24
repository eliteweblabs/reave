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
- Enable **Inbox Triage** (`email_inbox`) in install `features[]` (deploy baseline) and/or owner **Add-ons** toggle (runtime)
