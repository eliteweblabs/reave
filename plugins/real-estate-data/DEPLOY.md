---
feature: real_estate_data
defaultStatus: pending
stage: 3
---

# Real estate data deployment

## Sibling services

- None — property data from ATTOM or mock provider

## Required env vars

- `REAL_ESTATE_DATA_PROVIDER` — `attom` or `mock`
- `ATTOM_API_KEY` — required when provider is `attom`
- `LEAD_SCANNER_POLL_SECRET` — cron auth for `/api/lead-scanner/poll?key=`
- `LEAD_SCANNER_POLL_MINUTES` — optional; default 30

## External setup

- Enable `real_estate_data` in install config `features[]`
- Obtain ATTOM API key (or use `mock` for testing)
- Schedule daily lead scanner cron

## Checklist

- [ ] Set `REAL_ESTATE_DATA_PROVIDER` and `ATTOM_API_KEY`
- [ ] Set `LEAD_SCANNER_*` and configure geofence in admin
- [ ] Run a test property lookup via agent
- [ ] Set `moduleStatus.real_estate_data` → `deployed` in install config
