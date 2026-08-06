---
feature: fleet_tracking
defaultStatus: development
stage: 3
---

# Fleet tracking deployment

## Sibling services

- **fleet-api** — Reave App Railway service (`fleet-api` + Postgres)

## Required env vars

- `FLEET_API_BASE_URL` — e.g. `https://${{ fleet-api.RAILWAY_PUBLIC_DOMAIN }}`
- `FLEET_API_KEY` — shared client key (or `${{ shared.FLEET_API_CLIENT_KEY }}`)

## External setup

- Deploy fleet-api from `bootstrap/fleet-api/` or `eliteweblabs/fleet-api`
- Enable `fleet_tracking` in install config `features[]`
- Assign vehicles to Clerk user ids in fleet-api

## Checklist

- [ ] Deploy fleet-api + Postgres on Railway
- [ ] Set `FLEET_*` on Astro service
- [ ] Verify GPS reporting from a signed-in device
- [ ] Set `moduleStatus.fleet_tracking` → `deployed` in install config
