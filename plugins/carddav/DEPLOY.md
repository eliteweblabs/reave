---
feature: carddav
defaultStatus: deployed
stage: 2
---

# CardDAV (iOS Contacts sync) deployment

## Sibling services

- **contact-api** — Reave App Railway service (`contact-api` + `contact-postgres`)

## Required env vars

- `CONTACT_API_BASE_URL` — e.g. `https://${{ contact-api.RAILWAY_PUBLIC_DOMAIN }}`
- `CONTACT_API_KEY` — shared client key (or `${{ shared.CONTACT_API_CLIENT_KEY }}`)
- `CARDDAV_USERNAME` — HTTP Basic Auth user for iOS
- `CARDDAV_PASSWORD` — HTTP Basic Auth password for iOS

## External setup

- Deploy contact-api on Railway
- Enable `carddav` in install config `features[]`
- iOS: Settings → Contacts → Add Account → CardDAV (`/carddav`)

## Checklist

- [ ] Deploy contact-api + Postgres
- [ ] Set `CONTACT_API_*` and `CARDDAV_*` on Astro service
- [ ] Test CardDAV discovery at `/.well-known/carddav`
- [ ] Pair an iPhone and verify contact sync
- [ ] Set `moduleStatus.carddav` → `deployed` in install config
