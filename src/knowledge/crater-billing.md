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
- **Freeform (needs `ANTHROPIC_API_KEY`):** natural language → Claude calls Crater tools via `src/lib/telegramToolDefs.ts`.

## Custom API endpoints (all wired as assistant tools)

| Method | Path | Tool name |
|--------|------|-----------|
| POST | `/api/openclaw/create-invoice` | `create_invoice` |
| GET | `/api/openclaw/invoices` | `list_recent_invoices` |
| GET | `/api/openclaw/invoice/{id}` | `get_invoice` |
| PUT | `/api/openclaw/invoice/{id}` | `update_invoice` |
| DELETE | `/api/openclaw/invoice/{id}` | `delete_invoice` |
| POST | `/api/openclaw/invoice/{id}/items` | `add_invoice_items` |
| GET | `/api/openclaw/customers?q=` | `search_customers` |
| GET | `/api/openclaw/line-items?q=` | `search_line_items` |
| POST | `/api/openclaw/record-payment` | `record_payment` |
| GET | `/api/openclaw/recurring-invoices` | `list_recurring_invoices` |
| POST | `/api/openclaw/create-recurring-invoice` | `create_recurring_invoice` |
| POST | `/api/openclaw/repair-invoice-numbers` | `repair_invoice_numbers` |
| POST | `/api/openclaw/repair-payment-numbers` | `repair_payment_numbers` |
| POST | `/api/openclaw/reset-invoices` | `reset_invoices` |

Prices in create/add payloads are **whole dollars** (Crater stores cents). `record_payment` may return HTTP 300 with `needs_selection` when customer, invoice, or payment_mode is ambiguous.

Implementation: `src/lib/craterClient.ts` (HTTP) + `src/lib/telegramToolDefs.ts` (JSON schema + dispatch).
