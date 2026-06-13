# Crater billing (custom API)

Crater is the authoritative invoicing system, hosted at **https://ap.reave.app** (Railway service `crater` in the Reave App project). The Telegram bot talks to Crater's **custom** routes (`eliteweblabs/crater-invoicing` → `routes/api-custom.php`), mounted under `/api/openclaw/*`.

## Auth

All custom routes require header **`X-OpenClaw-Token`** equal to Crater's `OPENCLAW_API_TOKEN` env. In Reave the Astro service stores the same value as `CRATER_API_TOKEN`.

> **Note:** `openclaw` here is just the **legacy route prefix / header name** baked into the Crater PHP routes — it is **not** a separate service. There is no OpenClaw system in the Reave stack.

## Env (Astro / Reave)

| Variable | Purpose |
|----------|---------|
| `CRATER_API_BASE_URL` | Crater host, no trailing slash. Prefer `https://${{ crater.RAILWAY_PUBLIC_DOMAIN }}`. |
| `CRATER_API_TOKEN` | Mirror of Crater's `OPENCLAW_API_TOKEN`; sent as `X-OpenClaw-Token`. |

## Telegram usage

- **Deterministic (no LLM):** `/invoice <customer> | <amount> [| description]` — e.g. `/invoice Tony Vello | 100 | Website work`. Creates a one-line DRAFT invoice.
- **Freeform (needs `ANTHROPIC_API_KEY`):** "create an invoice for Tony Vello for $100" → the agent (Claude) calls the `create_invoice` tool.

## Key endpoints (used by the bot)

- `POST /api/openclaw/create-invoice` — body `{ customer_name, customer_email?, items:[{name, description?, quantity, price}], notes?, status? }`. Prices are **whole dollars** (Crater stores cents). Customer is found-or-created by name. Defaults to **DRAFT**. Returns `invoice_number`, `total`, `public_url`, `admin_url`.
- `GET /api/openclaw/customers?q=` — fuzzy customer search.
- `GET /api/openclaw/invoices` — recent invoices with totals + links.

Other available routes (not yet surfaced in the bot): `record-payment`, `invoice/{id}` get/update/delete, `invoice/{id}/items`, recurring invoices, and repair/reset utilities. See `routes/api-custom.php` in the crater-invoicing repo.
