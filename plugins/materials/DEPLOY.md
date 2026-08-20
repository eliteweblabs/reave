---
feature: materials_pricing
defaultStatus: development
stage: 3
---

# Materials pricing deployment

## Sibling services

- **materials-api** — Reave App Railway service (Home Depot pricing; Lowe's and others later)

## Required env vars

- `MATERIALS_API_BASE_URL` — e.g. `https://${{ materials-api.RAILWAY_PUBLIC_DOMAIN }}`
- `MATERIALS_API_KEY` — shared client key (or `${{ shared.MATERIALS_API_CLIENT_KEY }}`)

## External setup

- Deploy materials-api from `bootstrap/materials-api/` or `eliteweblabs/materials-api`
- Set at least one upstream provider key on **materials-api** (BigBox, SerpAPI, or Unwrangle)
- Enable `materials_pricing` in install config `features[]`

## Checklist

- [ ] Deploy materials-api on Railway
- [ ] Set `MATERIALS_*` on Astro service
- [ ] Test agent search / lookup / quote tools
- [ ] Set `moduleStatus.materials_pricing` → `deployed` in install config
