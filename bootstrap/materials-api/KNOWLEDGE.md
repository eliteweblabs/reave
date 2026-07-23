# Materials API — Live Retail Pricing

Agent-facing knowledge for the materials-api service.

The **materials-api** returns live product prices and availability from home-improvement retailers (Home Depot today; Lowe's and others later). Use it when quoting construction jobs, building material takeoffs, or answering "what does this cost at Home Depot?"

## When to Use

**Call materials-api before:**

- Building a materials list for an estimate or invoice
- Quoting lumber, drywall, paint, fixtures, or other retail SKUs
- Looking up a Home Depot product URL the user pasted

**Do not guess prices** when materials-api is configured — search or lookup first, then quote.

## API Endpoints

```
GET    /health                   — health check + configured providers
GET    /knowledge                — this playbook (markdown)
GET    /api/providers            — list provider adapters
POST   /api/search               — search by keyword
POST   /api/products/lookup      — price by retailer URL
GET    /api/products/:provider/:id — price by SKU / product id
POST   /api/prices/quote         — batch quote with quantities
```

Auth: `X-API-Key` header when `API_KEY` is set on the service.

## Search

```bash
curl -X POST "$MATERIALS_API_URL/api/search" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $MATERIALS_API_KEY" \
  -d '{"query":"2x4 stud","provider":"homedepot","zip":"02108","limit":5}'
```

Returns `{ ok, results[], provider, query, zip }`. Each result includes `title`, `offer.price`, `offer.inStock`, `sku`, and `url`.

**Note:** Unwrangle and SerpApi adapters do not support search — use BigBox or mock for keyword search, or use lookup/quote with `query` items.

## Lookup by URL

```bash
curl -X POST "$MATERIALS_API_URL/api/products/lookup" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $MATERIALS_API_KEY" \
  -d '{"url":"https://www.homedepot.com/p/...","zip":"02108"}'
```

## Batch quote

```bash
curl -X POST "$MATERIALS_API_URL/api/prices/quote" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $MATERIALS_API_KEY" \
  -d '{
    "provider":"homedepot",
    "zip":"02108",
    "items":[
      {"query":"2x4 stud","quantity":20,"label":"Studs"},
      {"url":"https://www.homedepot.com/p/...","quantity":2}
    ]
  }'
```

Returns `{ ok, lineItems[], subtotal, currency, provider, zip }`. Each line item has `unitPrice`, `extended`, and nested `product`.

## Providers

| Provider id | Retailer | Env key | Search | URL lookup |
|-------------|----------|---------|--------|------------|
| `mock` | Dev catalog | _(none)_ | yes | yes |
| `homedepot-unwrangle` | Home Depot | `UNWRANGLE_API_KEY` | no | yes |
| `homedepot-bigbox` | Home Depot | `BIGBOX_API_KEY` | yes | yes |
| `homedepot-serpapi` | Home Depot | `SERPAPI_API_KEY` | no | yes |

Pass `"provider":"homedepot"` to auto-pick the first configured adapter in `HOMEDEPOT_PROVIDER_ORDER` (default: `unwrangle,bigbox,serpapi,mock`).

## Environment Variables

| Var | Purpose |
|-----|---------|
| `API_KEY` | Optional gate — consumers send `X-API-Key` |
| `DEFAULT_STORE_ZIP` | ZIP for store-specific pricing (default `02108`) |
| `UNWRANGLE_API_KEY` | Home Depot via Unwrangle |
| `BIGBOX_API_KEY` | Home Depot via BigBox API |
| `SERPAPI_API_KEY` | Home Depot via SerpApi |
| `MOCK_PROVIDER` | `1` = mock catalog on (default); set `0` in prod without mock |
| `CACHE_TTL_SECONDS` | In-memory cache TTL (`0` = off) |

## Workflows

### Quote materials for a job

1. Collect items (keyword, URL, or SKU) and quantities.
2. `POST /api/prices/quote` with `"provider":"homedepot"` and the job site's ZIP.
3. Present `lineItems` with `extended` totals to the user.
4. If invoicing, map each line to Crater items (whole-dollar `price` × `quantity`).

### Single product price check

1. If the user pasted a Home Depot URL → `POST /api/products/lookup`.
2. If they named a product → `POST /api/search` then confirm the best match.
3. Report `offer.price`, `offer.listPrice` (if any), and `offer.availabilityText`.

### Reave admin agent

On Reave, prefer the authenticated proxy routes (`/api/materials/*`) via `src/lib/materialsClient.ts`. Read bundled knowledge slug **`materials-api-reference`** for env vars and Reave wiring.

## Design Notes

- Home Depot has no public API — upstream providers scrape or render retailer pages; prices vary by store ZIP.
- Quotes cap at **50 items** per request.
- Cached responses include `"cached": true` when served from memory.
- Health is `GET /health` (no `/api` prefix), same as contact-api.
