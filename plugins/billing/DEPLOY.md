---
feature: billing
defaultStatus: pending
stage: 3
---

# Billing (Crater) deployment

## Sibling services

- **Crater** — separate Railway service from `eliteweblabs/crater-invoicing`

## Required env vars

- `CRATER_API_BASE_URL` — public Crater host (e.g. `https://${{ crater.RAILWAY_PUBLIC_DOMAIN }}`)
- `CRATER_API_TOKEN` — must match Crater's `CRATER_API_TOKEN`

## External setup

- Deploy Crater + Postgres on Railway
- Enable `billing` in install config `features[]`
- Add `finance` to `footerNav` if not present

## Checklist

- [ ] Deploy Crater service + Postgres
- [ ] Set `CRATER_*` on Astro service
- [ ] Verify Finance tab loads in `/admin/`
- [ ] Test create invoice via agent or UI
- [ ] Set `moduleStatus.billing` → `deployed` in install config
