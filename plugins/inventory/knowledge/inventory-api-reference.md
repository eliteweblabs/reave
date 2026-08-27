# inventory-api (reference)

Standalone service: **multi-channel e-commerce inventory** — bootstrap in `bootstrap/inventory-api/` (future `eliteweblabs/inventory-api` on GitHub).

Use for Shopify, WooCommerce, Square, and future platform stock search — before quoting a client or building a Crater invoice from live catalog data.

Agent playbook also ships in the service repo as `KNOWLEDGE.md` (`GET /knowledge` on the service).

## Railway (Reave App only)

Add an **`inventory-api`** service inside the **Reave App** Railway project (same project as Astro, contact-api, materials-api).

Typical public base URL pattern: `https://inventory-api-production-<id>.up.railway.app` — use a variable reference (below).

## Railway variable references (preferred)

On the **Astro** consumer service → **Variables**:

```text
INVENTORY_API_BASE_URL=https://${{ inventory-api.RAILWAY_PUBLIC_DOMAIN }}
INVENTORY_API_KEY=${{ shared.INVENTORY_API_CLIENT_KEY }}
```

On **inventory-api**: `API_KEY=${{ shared.INVENTORY_API_CLIENT_KEY }}`

Reave sends `X-API-Key` when `INVENTORY_API_KEY` is set.

## Env (Reave / Astro)

- `INVENTORY_API_BASE_URL` — base URL for inventory-api (no trailing slash)
- `INVENTORY_API_KEY` — optional; sent as `X-API-Key`

Enable the plugin: add `inventory_sync` to install config `features`.

## Provider keys (inventory-api service only)

| Platform | Variables | Notes |
|----------|-----------|-------|
| Mock (demos) | `MOCK_PROVIDER=1` (default) | Multi-channel sample catalog |
| Shopify | `SHOPIFY_SHOP`, `SHOPIFY_ADMIN_TOKEN` | Live sync on client request |
| WooCommerce | `WOOCOMMERCE_URL`, `WOOCOMMERCE_KEY`, `WOOCOMMERCE_SECRET` | Per-store REST |
| Square | `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID` | Catalog + inventory counts |

## Reave proxy routes

All require dashboard auth + `inventory_sync` feature + configured base URL:

- `POST /api/inventory/search` — body: `{ query, provider?, limit?, inStockOnly? }`
- `GET /api/inventory/providers`
- `GET /api/inventory/product?provider=&id=`

## Upstream endpoints

- `POST {base}/api/search`
- `GET {base}/api/providers`
- `GET {base}/api/products/:provider/:id`

Use `provider: "all"` to merge configured channels (skips platforms returning 501 until live sync ships).

## Normalized product shape

```json
{
  "platform": "shopify",
  "externalId": "gid://shopify/ProductVariant/1001",
  "sku": "TEE-NAVY-M",
  "title": "Organic Cotton Tee",
  "variantTitle": "Navy / M",
  "price": { "amount": 32, "currency": "USD" },
  "quantity": 48,
  "inStock": true,
  "locations": [{ "id": "main", "name": "Main warehouse", "quantity": 48 }],
  "lastSyncedAt": "2026-08-03T..."
}
```

Map to Crater line items the same way as materials-api quote lines.
