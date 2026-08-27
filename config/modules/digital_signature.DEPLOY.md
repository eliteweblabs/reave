---
feature: digital_signature
defaultStatus: deployed
stage: 2
---

# Digital Signature deployment

Paid add-on on Dynamic Documents. Without this flag, clients can still receive
and print a filled document — they cannot e-sign.

## Sibling services

- Requires `documents` (deploy wizard adds it automatically)

## Required env vars

- None beyond core Reave (`DATABASE_URL` for contact/portal storage)

## External setup

- Enable `documents` and `digital_signature` in install config `features[]`
- Create signing templates in Admin → Documents
- Client signs at `/doc/:uid/:template` (consent + typed name)

## Checklist

- [ ] Confirm `documents` is enabled
- [ ] Enable `digital_signature` in install config
- [ ] Send a test template and complete Sign & Agree on a phone
- [ ] Confirm the signed copy, audit table, and admin alert
- [ ] Set `moduleStatus.digital_signature` → `deployed` in install config
