---
feature: namecom_dns
defaultStatus: deployed
stage: 3
---

# Name.com DNS deployment

## Sibling services

- None

## Required env vars

- `NAMECOM_USERNAME` — Name.com account username
- `NAMECOM_TOKEN` — API token from Name.com account settings

## External setup

- Enable `namecom_dns` in install config `features[]` (agency/ops installs only)
- Generate API token at Name.com → Account → API Access
- Per-call vault credentials also supported as an alternative

## Checklist

- [ ] Confirm install is agency/ops (not a typical client deployment)
- [ ] Set `NAMECOM_*` on Astro service
- [ ] Test `namecom_dns` agent tool (`ping`, `get_domain`, `list_records`, `set_nameservers`)
- [ ] Set `moduleStatus.namecom_dns` → `deployed` in install config
