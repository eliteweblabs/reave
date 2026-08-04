# inventory-api

Multi-channel e-commerce inventory microservice for REΛVE. Normalizes product stock across **Shopify**, **WooCommerce**, **Square**, and future platforms (BigCommerce, Amazon, eBay, Etsy).

Bootstrap source lives in `bootstrap/inventory-api/` until extracted to `eliteweblabs/inventory-api` on GitHub.

## Status

- **Mock provider** — multi-channel demo catalog (default for marketing installs)
- **Shopify / WooCommerce / Square** — credential detection + 501 until a client prioritizes live sync

## Quick start

```bash
cd bootstrap/inventory-api
cp .env.example .env
# set API_KEY
npm install
npm run dev
```

```bash
curl -s http://localhost:8080/health | jq
curl -s -H "X-API-Key: $API_KEY" -X POST http://localhost:8080/api/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"espresso","provider":"mock"}' | jq
```

## Railway

Add an **`inventory-api`** service in the Reave App Railway project. Point Astro at it:

```text
INVENTORY_API_BASE_URL=https://${{ inventory-api.RAILWAY_PUBLIC_DOMAIN }}
INVENTORY_API_KEY=${{ shared.INVENTORY_API_CLIENT_KEY }}
```

On the service: `API_KEY=${{ shared.INVENTORY_API_CLIENT_KEY }}`

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service + provider status |
| GET | `/knowledge` | Agent playbook markdown |
| GET | `/api/providers` | List platforms + configured flag |
| POST | `/api/search` | Search inventory (`query`, optional `provider`, filters) |
| GET | `/api/products/:provider/:id` | Single product by platform ID |
| GET | `/api/products/:provider/sku/:sku` | SKU lookup (mock only today) |

Use `provider: "all"` to search every configured channel (skips 501 stubs).
