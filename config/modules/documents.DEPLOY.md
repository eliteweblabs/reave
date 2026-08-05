---
feature: documents
defaultStatus: pending
stage: 2
---

# Documents deployment

## Sibling services

- None

## Required env vars

- None beyond core Reave (`DATABASE_URL` for template storage)

## External setup

- Enable `documents` in install config `features[]`
- Add `documents` to `footerNav` if not present
- Create signing templates in Admin → Documents

## Checklist

- [ ] Enable `documents` in install config
- [ ] Create a test template with shortcodes
- [ ] Verify PDF generation and client fill flow
- [ ] Set `moduleStatus.documents` → `deployed` in install config
