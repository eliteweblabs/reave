# Materials pricing (Home Depot & retailers)

Live retail product search, price lookup, and line-item quotes via **materials-api** — Home Depot today; Lowe's and other retailers later.

## Status

Proxy routes and agent tools ship with reΛVe.app. **Mock provider** works for demos; live Home Depot pricing needs an upstream key on materials-api.

## Feature gate

Install config:

```json
{ "features": ["materials_pricing", ...] }
```

## Env (Reave / Astro)

- `MATERIALS_API_BASE_URL` — materials-api service URL (no trailing slash)
- `MATERIALS_API_KEY` — optional; sent as `X-API-Key`

Railway reference on Astro:

```text
MATERIALS_API_BASE_URL=https://${{ materials-api.RAILWAY_PUBLIC_DOMAIN }}
MATERIALS_API_KEY=${{ shared.MATERIALS_API_CLIENT_KEY }}
```

## Agent tools

When active + configured:

- `search_materials` — keyword search (lumber, drywall, paint, fixtures, …)
- `lookup_materials_url` — live price for a pasted Home Depot product URL
- `quote_materials` — line-item quote with quantities for Crater estimates
- `list_materials_providers` — configured retailers and upstream status

Read slug **`materials-api-reference`** in core knowledge for API details before quoting prices.

## Use cases

- “How much is 20 sheets of 1/2″ drywall at Home Depot near 90210?”
- Paste a homedepot.com URL and get the current unit price for an estimate.
- Build a materials takeoff and map quote lines to a Crater invoice (whole-dollar prices).

## Do not guess prices

When materials-api is configured, search or lookup first — never invent retail numbers.
