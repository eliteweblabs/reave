---
feature: inventory_sync
defaultStatus: development
stage: 3
---

# Inventory sync deployment

## Sibling services

- **inventory-api** — Reave App Railway service (Shopify, WooCommerce, Square)

## Required env vars

- `INVENTORY_API_BASE_URL` — e.g. `https://${{ inventory-api.RAILWAY_PUBLIC_DOMAIN }}`
- `INVENTORY_API_KEY` — shared client key (or `${{ shared.INVENTORY_API_CLIENT_KEY }}`)

## External setup

- Deploy inventory-api from `bootstrap/inventory-api/`
- Enable `inventory_sync` in install config `features[]`
- Connect sales channels in inventory-api admin

## Checklist

- [ ] Deploy inventory-api on Railway
- [ ] Set `INVENTORY_*` on Astro service
- [ ] Test agent inventory list/sync tools
- [ ] Set `moduleStatus.inventory_sync` → `deployed` in install config
