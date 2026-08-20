---
feature: email_signature
defaultStatus: deployed
stage: 1
---

# Email signature deployment

## Sibling services

- None

## Required env vars

- None (uses Clerk profile + company branding already on the install)

## External setup

- Enable `email_signature` in install config `features[]` (tier-1 baseline — on by default)
- Confirm Admin → Profile shows the Email signature section
- Confirm `/signature.html` loads a copy-paste Gmail/Outlook block

## Checklist

- [ ] Add `email_signature` to install `features[]` (or rely on the tier-1 baseline)
- [ ] Open Admin → Profile — job title, logo toggle, and live preview appear
- [ ] Copy signature and paste into Gmail Settings → General → Signature
- [ ] Send a compose/reply from admin Inbox — signature is appended
- [ ] Confirm GET `/api/demo/loader` `features` includes `email-signature`
