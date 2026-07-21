# Crater billing (custom API)

Crater is the authoritative invoicing system, hosted at **https://ap.reave.app** (Railway service `crater` in the Reave App project). The admin dashboard and API integrations use Crater's **custom** routes (`eliteweblabs/crater-invoicing` → `routes/api-custom.php`), mounted under `/api/custom/*`.

## Auth

All custom routes require header **`X-Crater-Api-Token`** equal to Crater's `CRATER_API_TOKEN` env. In Reave the Astro service stores the same value as `CRATER_API_TOKEN`.

> **Note:** the custom API was previously mounted at `/api/openclaw/*` with an `X-OpenClaw-Token` header; Crater commit `a97ec97` (2026-06-13) renamed it to `/api/custom/*` + `X-Crater-Api-Token`. There is no separate OpenClaw service in the Reave stack.

## Env (Astro / Reave)

| Variable | Purpose |
|----------|---------|
| `CRATER_API_BASE_URL` | Crater host, no trailing slash. Prefer `https://${{ crater.RAILWAY_PUBLIC_DOMAIN }}`. |
| `CRATER_API_TOKEN` | Mirror of Crater's `CRATER_API_TOKEN`; sent as `X-Crater-Api-Token`. |

## Admin & API Usage

- **Admin Dashboard:** Manage invoices through the `/admin` interface
- **Agent Tools (needs `ANTHROPIC_API_KEY`):** Natural language → Claude calls Crater tools via `src/lib/agentTools.ts` for invoice creation and management
- **Siri Shortcuts:** Can be extended to integrate with Crater invoice APIs for voice-controlled billing

## Custom API endpoints (all wired as assistant tools)

| Method | Path | Tool name |
|--------|------|-----------|
| POST | `/api/custom/create-invoice` | `create_invoice` |
| GET | `/api/custom/invoices` | `list_recent_invoices` |
| GET | `/api/custom/payments` | _(client portal payment history)_ |
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

Implementation: `src/lib/craterClient.ts` (HTTP) + `src/lib/agentTools.ts` (JSON schema + dispatch).
