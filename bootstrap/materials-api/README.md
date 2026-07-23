# materials-api

Retail materials pricing API for construction and home-improvement workflows. Connect to Home Depot (and future retailers) to search products, look up live prices, and build line-item quotes on the fly.

Deploy once on Railway in the **Reave App** project, then point Reave (or any consumer) at it with `MATERIALS_API_BASE_URL`.

## Why a separate service?

Home Depot has no public product API. Real-time pricing requires third-party data providers (Unwrangle, BigBox, SerpApi, etc.) with their own keys, caching, and failover. Keeping that logic in a dedicated microservice matches how this org runs `contact-api`, `calcom-booking-api`, and Crater.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service health + configured providers |
| `GET` | `/api/providers` | List provider adapters and config status |
| `POST` | `/api/search` | Search products by keyword |
| `GET` | `/api/products/:provider/:id` | Product details + price by SKU/id |
| `POST` | `/api/products/lookup` | Product details + price by retailer URL |
| `POST` | `/api/prices/quote` | Batch quote for multiple line items |

All JSON responses use `{ ok: true, ... }` or `{ ok: false, error }`.

### Search

```bash
curl -X POST https://your-domain/api/search \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"query":"2x4 stud","provider":"homedepot","zip":"02108","limit":5}'
```

### Lookup by URL

```bash
curl -X POST https://your-domain/api/products/lookup \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"url":"https://www.homedepot.com/p/...","zip":"02108"}'
```

### Batch quote

```bash
curl -X POST https://your-domain/api/prices/quote \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "provider":"homedepot",
    "zip":"02108",
    "items":[
      {"query":"2x4 stud","quantity":20},
      {"url":"https://www.homedepot.com/p/...","quantity":2}
    ]
  }'
```

## Providers

| Provider id | Retailer | Requires | Search | URL lookup |
|-------------|----------|----------|--------|------------|
| `mock` | Dev catalog | nothing (on by default) | yes | yes |
| `homedepot-unwrangle` | Home Depot | `UNWRANGLE_API_KEY` | no | yes |
| `homedepot-bigbox` | Home Depot | `BIGBOX_API_KEY` | yes | yes |
| `homedepot-serpapi` | Home Depot | `SERPAPI_API_KEY` | no | yes |

When you pass `"provider":"homedepot"`, the service picks the first configured adapter in `HOMEDEPOT_PROVIDER_ORDER` (default: `unwrangle,bigbox,serpapi,mock`).

Set `MOCK_PROVIDER=0` in production if you only want live data.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP port |
| `API_KEY` | *(none)* | If set, all endpoints except `/health` require `X-API-Key` |
| `ALLOWED_ORIGINS` | `*` | CORS origins (comma-separated) |
| `DEFAULT_STORE_ZIP` | `02108` | ZIP for store-specific pricing |
| `MOCK_PROVIDER` | `1` | Set `0` to disable mock catalog |
| `UNWRANGLE_API_KEY` | | Home Depot via [Unwrangle](https://docs.unwrangle.com/homedepot-product-data-api/) |
| `BIGBOX_API_KEY` | | Home Depot via [BigBox API](https://trajectdata.com/ecommerce/big-box-api/) |
| `SERPAPI_API_KEY` | | Home Depot via [SerpApi](https://serpapi.com/home-depot-product-api) |
| `HOMEDEPOT_PROVIDER_ORDER` | `unwrangle,bigbox,serpapi,mock` | Failover order |
| `CACHE_TTL_SECONDS` | `300` | In-memory cache TTL (`0` = off) |

## Deploy to Railway (Reave App)

1. Push this repo to GitHub (`eliteweblabs/materials-api`)
2. In the **Reave App** Railway project → **New service** → connect the repo
3. Generate a public domain (or keep internal-only)
4. Set provider API keys and `API_KEY`
5. On the **Astro** service, add:
   ```text
   MATERIALS_API_BASE_URL=https://${{ materials-api.RAILWAY_PUBLIC_DOMAIN }}
   MATERIALS_API_KEY=${{ shared.MATERIALS_API_CLIENT_KEY }}
   ```

## Local dev

```bash
cp .env.example .env
npm install
npm run dev
curl http://localhost:8080/health
curl -X POST http://localhost:8080/api/search -H 'Content-Type: application/json' -d '{"query":"stud"}'
```

## Reave consumer

See `src/knowledge/materials-api-reference.md` in the [reave](https://github.com/eliteweblabs/reave) repo for env vars and client usage.
