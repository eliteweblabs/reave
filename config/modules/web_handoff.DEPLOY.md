---
feature: web_handoff
defaultStatus: deployed
stage: 2
---

# Web handoff deployment

## Sibling services

- None — part of client portal; uses contact-api portal links

## Required env vars

- None beyond core Reave (`CONTACT_API_*` via client portal)

## External setup

- Enable `web_handoff` in install config `features[]` (requires `client_portal`)
- Portal Data tab stores handoff credentials in contact portal metadata

## Checklist

- [ ] Confirm `client_portal` is enabled
- [ ] Enable `web_handoff` in install config
- [ ] Add handoff credentials on a test client portal
- [ ] Set `moduleStatus.web_handoff` → `deployed` in install config
