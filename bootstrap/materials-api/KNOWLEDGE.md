# materials-api (agent knowledge)

Standalone service: **eliteweblabs/materials-api** on GitHub.

## Purpose

Live retail materials pricing for construction workflows — search Home Depot products, look up prices by SKU or URL, and build batch quotes. Intended to feed estimates/invoices (Crater line items) and agent tools in Reave admin.

## Railway (Reave App)

Add a **`materials-api`** service in the **Reave App** Railway project (same project as Astro, contact-api, Crater).

On the **Astro** consumer:

```text
MATERIALS_API_BASE_URL=https://${{ materials-api.RAILWAY_PUBLIC_DOMAIN }}
MATERIALS_API_KEY=${{ shared.MATERIALS_API_CLIENT_KEY }}
```

Optional shared variable pattern (like contact-api):

- On **materials-api**: `API_KEY=${{ shared.MATERIALS_API_CLIENT_KEY }}`
- On **Astro**: `MATERIALS_API_KEY=${{ shared.MATERIALS_API_CLIENT_KEY }}`

## Key endpoints

- `POST /api/search` — `{ query, provider?, zip?, limit? }`
- `POST /api/products/lookup` — `{ url, provider?, zip? }`
- `GET /api/products/:provider/:id?zip=` — product by id/SKU
- `POST /api/prices/quote` — `{ items: [{ query|url|id|sku, quantity, label? }], provider?, zip? }`

Auth: `X-API-Key` when `API_KEY` is set on the service.

## Provider setup

Home Depot has **no public API**. Configure at least one upstream key on the materials-api service:

| Env | Provider |
|-----|----------|
| `UNWRANGLE_API_KEY` | Unwrangle THD detail API (URL lookup) |
| `BIGBOX_API_KEY` | BigBox API (search + lookup) |
| `SERPAPI_API_KEY` | SerpApi home_depot_product |

Without live keys, `mock` provider returns a small dev catalog (`MOCK_PROVIDER=1` by default).

Set `DEFAULT_STORE_ZIP` for location-specific pricing (e.g. Boston `02108`).

## Reave client

`src/lib/materialsClient.ts` — `isMaterialsApiConfigured()`, `materialsSearch()`, `materialsLookupUrl()`, `materialsQuote()`.

Proxy routes (Clerk-authenticated): `/api/materials/search`, `/api/materials/lookup`, `/api/materials/quote`.

## Billing tie-in

Use `materialsQuote()` to get priced line items, then map to Crater invoice items via existing billing tools (`create_invoice`, `search_line_items`). Prices are in whole-dollar units for Crater.
