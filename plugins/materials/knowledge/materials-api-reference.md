# materials-api (reference)

Standalone service: **live retail materials pricing** — `eliteweblabs/materials-api` on GitHub.

Use for Home Depot (and future retailer) product search, price lookup, and batch quotes — typically before building an estimate or Crater invoice for a construction job.

Bootstrap source (before the GitHub repo exists): `bootstrap/materials-api/` in this repo. Agent playbook also ships in the service repo as `KNOWLEDGE.md` (`GET /knowledge` on the service).

## Feature gate

Install config:

```json
{ "features": ["materials_pricing", ...] }
```

## Railway (Reave App only)

Add a **`materials-api`** service inside the **Reave App** Railway project (same project as Astro, contact-api, Crater).

Typical public base URL pattern: `https://materials-api-production-<id>.up.railway.app` — do **not** hardcode; use a variable reference (below).

## Railway variable references (preferred)

On the **Astro** consumer service → **Variables**:

```text
MATERIALS_API_BASE_URL=https://${{ materials-api.RAILWAY_PUBLIC_DOMAIN }}
```

Use the **exact** service name as shown in Railway. Official docs: [Reference variables](https://docs.railway.com/guides/variables#reference-variables).

### Optional API key

Prefer a **shared variable** e.g. `MATERIALS_API_CLIENT_KEY`:

- On **materials-api**: `API_KEY=${{ shared.MATERIALS_API_CLIENT_KEY }}`
- On **Astro**: `MATERIALS_API_KEY=${{ shared.MATERIALS_API_CLIENT_KEY }}`

Reave sends `X-API-Key` when `MATERIALS_API_KEY` is set.

## Env (Reave / Astro)

- `MATERIALS_API_BASE_URL` — base URL for materials-api (no trailing slash)
- `MATERIALS_API_KEY` — optional; sent as `X-API-Key`

## Provider keys (materials-api service only)

Home Depot has **no public product API**. Set at least one upstream key on the **materials-api** Railway service:

| Env | Provider |
|-----|----------|
| `UNWRANGLE_API_KEY` | [Unwrangle THD detail](https://docs.unwrangle.com/homedepot-product-data-api/) — URL lookup |
| `BIGBOX_API_KEY` | [BigBox API](https://trajectdata.com/ecommerce/big-box-api/) — search + lookup |
| `SERPAPI_API_KEY` | [SerpApi home_depot_product](https://serpapi.com/home-depot-product-api) |

Also set `DEFAULT_STORE_ZIP` for store-specific pricing (e.g. `02108`). Without live keys, the mock catalog is used (`MOCK_PROVIDER=1` by default; set `MOCK_PROVIDER=0` in production).

## When to use (agent)

**Call materials pricing before:**

- Quoting a job that lists lumber, drywall, paint, fixtures, etc.
- Building a materials line-item list for a Crater estimate or invoice
- Answering "what does X cost at Home Depot?" with a live price

**Workflow:**

1. Search or lookup products (`/api/materials/search` or `/api/materials/lookup` on Reave, or upstream materials-api).
2. Build a quote with quantities (`/api/materials/quote`).
3. Map quote line items to Crater via billing tools (`create_invoice`, `search_line_items`). Crater prices are **whole dollars**.

Always pass `zip` when the user cares about store-specific pricing or availability.

## Upstream endpoints (materials-api)

| Method | Path | Body |
|--------|------|------|
| `GET` | `/health` | — |
| `GET` | `/knowledge` | — (agent playbook markdown) |
| `GET` | `/api/providers` | — |
| `POST` | `/api/search` | `{ query, provider?, zip?, limit? }` |
| `POST` | `/api/products/lookup` | `{ url, provider?, zip? }` |
| `GET` | `/api/products/:provider/:id?zip=` | — |
| `POST` | `/api/prices/quote` | `{ items: [{ query\|url\|id\|sku, quantity, label? }], provider?, zip? }` |

Pass `"provider":"homedepot"` to auto-select the first configured Home Depot adapter (`unwrangle` → `bigbox` → `serpapi` → `mock`).

## Reave proxy routes (Clerk auth)

Thin wrappers around `src/lib/materialsClient.ts`:

- `POST /api/materials/search`
- `POST /api/materials/lookup`
- `POST /api/materials/quote`
- `GET /api/materials/providers`

Returns `{ ok: false, error: 'MATERIALS_API_BASE_URL is not configured' }` with HTTP 503 when unset.

## Related docs

- **`crater-billing`** — invoicing after you have priced line items
- **`contact-api-reference`** — resolve the client before sending an invoice
