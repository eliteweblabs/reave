---
feature: documents
defaultStatus: deployed
stage: 2
---

# Documents deployment

## Sibling services

- `digital_signature` (optional paid add-on) — e-sign, consent, audit trail

## Required env vars

- None beyond core Reave (`DATABASE_URL` for template storage)

## External setup

- Enable `documents` in install config `features[]`
- Add `documents` to `footerNav` if not present
- Create templates in Admin → Documents
- Send a filled review/print link from the share sheet (e-sign is a separate module)

## Checklist

- [ ] Enable `documents` in install config
- [ ] Create a test template with shortcodes
- [ ] Verify fill, send, and client print/PDF without Digital Signature
- [ ] Set `moduleStatus.documents` → `deployed` in install config
