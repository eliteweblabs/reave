# inventory-api (agent playbook)

Multi-channel inventory search for REΛVE — Shopify, WooCommerce, Square, and more via `inventory-api`.

## When to use

- Client asks about **stock levels** across online stores or POS
- Quote or invoice needs a **live SKU** from their e-commerce stack
- Compare availability on Shopify vs WooCommerce for the same product line

## Reave routes (FEATURES: `inventory_sync`)

- `POST /api/inventory/search` — `{ query, provider?, limit?, inStockOnly? }`
- `GET /api/inventory/providers` — configured channels
- `GET /api/inventory/product?provider=&id=` — single item

Upstream service mirrors materials-api:

- `POST {INVENTORY_API_BASE_URL}/api/search`
- `GET {INVENTORY_API_BASE_URL}/api/providers`

Send `X-API-Key` when `INVENTORY_API_KEY` is set on Astro.

## Providers

| Provider | Env (inventory-api service) | Status |
|----------|----------------------------|--------|
| `mock` | `MOCK_PROVIDER=1` (default) | Demo catalog — Shopify/Woo/Square sample SKUs |
| `shopify` | `SHOPIFY_SHOP`, `SHOPIFY_ADMIN_TOKEN` | Live sync on client request |
| `woocommerce` | `WOOCOMMERCE_URL`, `WOOCOMMERCE_KEY`, `WOOCOMMERCE_SECRET` | Live sync on client request |
| `square` | `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID` | Live sync on client request |

Use `provider: "all"` to merge results from every configured channel.

## Agent tools

- `search_inventory` — search by keyword/SKU across a channel or all
- `get_inventory_product` — fetch one item by platform + external ID
- `list_inventory_channels` — which platforms are configured

Always call `read_knowledge` slug `inventory-api-reference` before quoting stock to a client.

## Billing tie-in

Normalized products include `price`, `sku`, and `title` — map to Crater line items the same way as materials-api quotes.
