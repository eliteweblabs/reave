# Crater billing (custom API)

Crater is the authoritative invoicing system, hosted at **https://ap.reave.app** (Railway service `crater` in the Reave App project). The Telegram bot talks to Crater's **custom** routes (`eliteweblabs/crater-invoicing` → `routes/api-custom.php`), mounted under `/api/custom/*`.

## Auth

All custom routes require header **`X-Crater-Api-Token`** equal to Crater's `CRATER_API_TOKEN` env. The Astro service uses the same value in its `CRATER_API_TOKEN` variable (shared secret via Railway reference or shared var).

## Env (Astro / Reave)

| Variable | Purpose |
|----------|---------|
| `CRATER_API_BASE_URL` | Crater host, no trailing slash. Prefer `https://${{ crater.RAILWAY_PUBLIC_DOMAIN }}`. |
| `CRATER_API_TOKEN` | Shared secret; sent as `X-Crater-Api-Token`. Set on **both** Astro and Crater. |

## Telegram usage

- **Deterministic (no LLM):** `/invoice <customer> | <amount> [| description]` — e.g. `/invoice Tony Vello | 100 | Website work`. Creates a one-line DRAFT invoice.
- **Freeform (needs `ANTHROPIC_API_KEY`):** natural language → Claude calls Crater tools via `src/lib/telegramToolDefs.ts`.

## Custom API endpoints (all wired as assistant tools)

| Method | Path | Tool name |
|--------|------|-----------|
| POST | `/api/custom/create-invoice` | `create_invoice` |
| GET | `/api/custom/invoices` | `list_recent_invoices` |
| GET | `/api/custom/invoice/{id}` | `get_invoice` |
| PUT | `/api/custom/invoice/{id}` | `update_invoice` |
| DELETE | `/api/custom/invoice/{id}` | `delete_invoice` |
| POST | `/api/custom/invoice/{id}/items` | `add_invoice_items` |
| GET | `/api/custom/customers?q=` | `search_customers` |
| GET | `/api/custom/line-items?q=` | `search_line_items` |
| POST | `/api/custom/record-payment` | `record_payment` |
| GET | `/api/custom/recurring-invoices` | `list_recurring_invoices` |
| POST | `/api/custom/create-recurring-invoice` | `create_recurring_invoice` |
| POST | `/api/custom/repair-invoice-numbers` | `repair_invoice_numbers` |
| POST | `/api/custom/repair-payment-numbers` | `repair_payment_numbers` |
| POST | `/api/custom/reset-invoices` | `reset_invoices` |

Prices in create/add payloads are **whole dollars** (Crater stores cents). `record_payment` may return HTTP 300 with `needs_selection` when customer, invoice, or payment_mode is ambiguous.

Implementation: `src/lib/craterClient.ts` (HTTP) + `src/lib/telegramToolDefs.ts` (JSON schema + dispatch).

**Deploy note:** Set `CRATER_API_TOKEN` on the Crater Railway service to the same shared secret Astro uses.
