# materials-api (reference)

Standalone service: **eliteweblabs/materials-api** on GitHub.

Bootstrap source (before the GitHub repo exists): `bootstrap/materials-api/` in this repo.

## Railway (Reave App)

Add a **`materials-api`** service in the **Reave App** Railway project (same project as Astro, contact-api, Crater).

On the **Astro** consumer → **Variables**:

```text
MATERIALS_API_BASE_URL=https://${{ materials-api.RAILWAY_PUBLIC_DOMAIN }}
MATERIALS_API_KEY=${{ shared.MATERIALS_API_CLIENT_KEY }}
```

Prefer Railway **reference variables** over pasted URLs. Official docs: [Reference variables](https://docs.railway.com/guides/variables#reference-variables).

### Optional API key (shared variable pattern)

- On **materials-api**: `API_KEY=${{ shared.MATERIALS_API_CLIENT_KEY }}`
- On **Astro**: `MATERIALS_API_KEY=${{ shared.MATERIALS_API_CLIENT_KEY }}`

Client sends `X-API-Key` when `MATERIALS_API_KEY` is set.

## Env (Reave / Astro)

- `MATERIALS_API_BASE_URL` — base URL for materials-api (no trailing slash)
- `MATERIALS_API_KEY` — optional; sent as `X-API-Key`

## Endpoints (upstream)

| Method | Path | Body |
|--------|------|------|
| `GET` | `/health` | — |
| `GET` | `/api/providers` | — |
| `POST` | `/api/search` | `{ query, provider?, zip?, limit? }` |
| `POST` | `/api/products/lookup` | `{ url, provider?, zip? }` |
| `POST` | `/api/prices/quote` | `{ items: [{ query\|url\|id\|sku, quantity }], provider?, zip? }` |

Reave proxy routes (Clerk auth): `/api/materials/search`, `/api/materials/lookup`, `/api/materials/quote`, `/api/materials/providers`.

## Provider keys (on materials-api service)

Home Depot has no public API. Set at least one on the **materials-api** Railway service:

| Env | Provider |
|-----|----------|
| `UNWRANGLE_API_KEY` | [Unwrangle THD detail](https://docs.unwrangle.com/homedepot-product-data-api/) |
| `BIGBOX_API_KEY` | [BigBox API](https://trajectdata.com/ecommerce/big-box-api/) |
| `SERPAPI_API_KEY` | [SerpApi home_depot_product](https://serpapi.com/home-depot-product-api) |

Without live keys, the mock catalog is used (`MOCK_PROVIDER=1` by default). Set `DEFAULT_STORE_ZIP` for store-specific pricing.

## Client library

`src/lib/materialsClient.ts`:

- `isMaterialsApiConfigured()`
- `materialsSearch()`, `materialsLookupUrl()`, `materialsQuote()`, `materialsListProviders()`

## Publish the GitHub repo

From a machine with org repo-create access:

```sh
cd bootstrap/materials-api
git init && git add -A && git commit -m "Initial materials-api"
gh repo create eliteweblabs/materials-api --public --source=. --remote=origin --push
```

Then connect the repo to a new Railway service in Reave App.

## Billing tie-in

Use `materialsQuote()` for priced line items, then map to Crater via existing billing tools (`create_invoice`, `search_line_items`). Crater prices are whole-dollar units.
