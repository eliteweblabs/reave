---
feature: client_portal
defaultStatus: deployed
stage: 1
---

# Client portal deployment

## Sibling services

- **contact-api** — portal content stored on contact links (always required for Reave App)

## Required env vars

- None beyond core Reave (`CONTACT_API_*` is always-on, not portal-specific)

## External setup

- Enable `client_portal` in install config `features[]`
- Portal pages live at `/c/:uid` for every contact

## Checklist

- [ ] Enable `client_portal` in install config
- [ ] Verify a contact portal loads at `/c/<uid>`
- [ ] Test Call / Text / Email actions on mobile Safari
- [ ] Set `moduleStatus.client_portal` → `deployed` in install config
