# Multi-channel inventory sync

Connect **Shopify**, **WooCommerce**, **Square**, and future platforms (BigCommerce, Amazon, eBay, Etsy) into one normalized stock view inside REΛVE.

## Status

Marketing and scaffold are live. **Mock provider** ships for demos; live platform sync is enabled when a client prioritizes `inventory_sync`.

## Feature gate

Install config:

```json
{ "features": ["inventory_sync", ...] }
```

## Env (Reave / Astro)

- `INVENTORY_API_BASE_URL` — inventory-api service URL (no trailing slash)
- `INVENTORY_API_KEY` — optional; sent as `X-API-Key`

Railway reference on Astro:

```text
INVENTORY_API_BASE_URL=https://${{ inventory-api.RAILWAY_PUBLIC_DOMAIN }}
INVENTORY_API_KEY=${{ shared.INVENTORY_API_CLIENT_KEY }}
```

## Agent tools

When active + configured:

- `search_inventory` — keyword/SKU search across one or all channels
- `get_inventory_product` — single item by platform + external id
- `list_inventory_channels` — configured platforms

Read slug **`inventory-api-reference`** in core knowledge for API details before quoting stock.

## Use cases

- “Do we have the gray hoodie in large on Shopify?”
- “Compare SKU ESP-12OZ stock on Square vs the Woo store.”
- Pull line items into Crater invoices from live catalog data.

## Roadmap (client-prioritized)

1. Shopify Admin API — variants + inventory levels per location
2. WooCommerce REST — per-store credentials
3. Square Catalog + Inventory — cafe/retail POS overlap
4. Webhooks + Postgres cache for near-real-time sync
5. BigCommerce, Amazon SP-API, eBay, Etsy on request
