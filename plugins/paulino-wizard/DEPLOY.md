---
feature: dealership_wizard
defaultStatus: deployed
stage: 3
---

# Paulino wizard deployment

## Sibling services

- **paulino-wizard** — separate Railway project (`eliteweblabs/paulino-wizard`)

## Required env vars

- `PAULINO_WIZARD_API_BASE_URL` — e.g. `https://paulino-wizard-production.up.railway.app`
- `PAULINO_WIZARD_API_KEY` — optional; when the API enforces auth

## External setup

- Deploy paulino-wizard service (Paulino Auto Group project)
- Enable `dealership_wizard` in install config `features[]`
- Configure dealership inventory and deal workflows in paulino-wizard

## Checklist

- [ ] Deploy paulino-wizard API on Railway
- [ ] Set `PAULINO_WIZARD_API_*` on Astro service
- [ ] Test agent inventory/deal tools
- [ ] Set `moduleStatus.dealership_wizard` → `deployed` in install config
