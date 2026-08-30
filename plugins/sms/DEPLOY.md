---
feature: sms
defaultStatus: deployed
stage: 2
---

# Two-way SMS deployment

## Sibling services

- **Telnyx** — Messaging profile + phone number (often shared with `voice`)

## Required env vars

- `TELNYX_API_KEY` — Telnyx portal API key
- `TELNYX_FROM_NUMBER` — E.164 number used for outbound SMS
- `TELNYX_WEBHOOK_PUBLIC_KEY` — webhook signature validation for inbound

## External setup

- Enable `sms` in install config `features[]`
- Point Telnyx Messaging Profile webhook → `https://<host>/api/sms`
- Confirm A2P / 10DLC (or equivalent) registration for the number
- **Cannot be tested in a demo environment** — needs a live Telnyx number and carrier messaging profile

## Checklist

- [ ] Set `TELNYX_API_KEY` and `TELNYX_FROM_NUMBER`
- [ ] Point inbound SMS webhook at production `/api/sms`
- [ ] Send a test outbound text from admin chat or Siri `send_sms`
- [ ] Reply from a phone and confirm inbound lands (System alerts / contact thread)
- [ ] Set `moduleStatus.sms` → `deployed` in install config
