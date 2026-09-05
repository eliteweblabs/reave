# Crater billing (custom API)

Crater is the authoritative invoicing system, hosted at **https://ap.reave.app** (Railway service `crater` in the Reave App project). The admin dashboard and API integrations use Crater's **custom** routes (`eliteweblabs/crater` → `routes/api-custom.php`), mounted under `/api/custom/*`.

## Auth

All custom routes require header **`X-Crater-Api-Token`** equal to Crater's `CRATER_API_TOKEN` env. In Reave the Astro service stores the same value as `CRATER_API_TOKEN`.

> **Note:** the custom API was previously mounted at `/api/openclaw/*` with an `X-OpenClaw-Token` header; Crater commit `a97ec97` (2026-06-13) renamed it to `/api/custom/*` + `X-Crater-Api-Token`. There is no separate OpenClaw service in the Reave stack.

## Env (Astro / Reave)

| Variable | Purpose |
|----------|---------|
| `CRATER_API_BASE_URL` | Crater host, no trailing slash. Prefer `https://${{ crater.RAILWAY_PUBLIC_DOMAIN }}`. |
| `CRATER_API_TOKEN` | Mirror of Crater's `CRATER_API_TOKEN`; sent as `X-Crater-Api-Token`. |
| `REAVE_APP_URL` | reave.app origin for `GET /api/branding` (logo + colors from admin company_config). |
| `COMPANY_LOGO_URL` | _(legacy fallback only)_ Used when admin has no wordmark or API is unreachable. |

## Admin & API Usage

- **Admin Dashboard:** Manage invoices through the `/admin` interface
- **Agent Tools (needs `ANTHROPIC_API_KEY`):** Natural language → Claude calls Crater tools via `src/lib/agentTools.ts` for invoice creation and management
- **Siri Shortcuts:** `POST /api/siri` with `action: "record_payment"` (aliases `add_payment`, `create_payment`) records offline payments via Crater

## Custom API endpoints

| Method | Path | Tool name |
|--------|------|-----------|
| GET | `/api/custom/branding` | _(admin branding: colors + logoEmailUrl from reave `/api/branding`)_ |
| POST | `/api/custom/create-invoice` | `create_invoice` |
| GET | `/api/custom/invoices` | `list_recent_invoices` |
| GET | `/api/custom/payments` | _(client portal payment history)_ |
| GET | `/api/custom/invoice/{id}` | `get_invoice` |
| PUT | `/api/custom/invoice/{id}` | `update_invoice` |
| DELETE | `/api/custom/invoice/{id}` | `delete_invoice` |
| POST | `/api/custom/invoice/{id}/items` | `add_invoice_items` |
| PUT | `/api/custom/invoice/{invoiceId}/items/{itemId}` | _(edit one line: name / description / qty / price)_ |
| GET | `/api/custom/customers?q=` | `search_customers` |
| POST | `/api/custom/create-customer` | _(reave.app push contact → Crater; paste `crater-create-customer.route.php`)_ |
| PUT | `/api/custom/customer/{id}` | _(reave.app contact → Crater sync on client edit)_ |
| GET | `/api/custom/line-items?q=` | `search_line_items` |
| POST | `/api/custom/record-payment` | `record_payment` |
| POST | `/api/custom/create-expense` | _(dashboard receipt → expense; paste `crater-create-expense.route.php`)_ |
| GET | `/api/custom/recurring-invoices` | `list_recurring_invoices` |
| POST | `/api/custom/create-recurring-invoice` | `create_recurring_invoice` |
| POST | `/api/custom/repair-invoice-numbers` | `repair_invoice_numbers` |
| POST | `/api/custom/repair-payment-numbers` | `repair_payment_numbers` |
| POST | `/api/custom/reset-invoices` | `reset_invoices` |

Prices in create/add payloads are **whole dollars** (Crater stores cents). `record_payment` `payment_mode` is a Crater payment mode **name** (Settings → Payment Modes), not a fixed enum — Apple Pay, Venmo, Zelle, Stripe, Cash, Bank Transfer, or any custom mode. It may return HTTP 300 with `needs_selection` when customer, invoice, or payment_mode is ambiguous or missing.

Authoritative playbook for toggles, public invoices, and line-item edits: **`KNOWLEDGE.md` in `eliteweblabs/crater`** (repo root). Keep this file in sync when that doc changes.

## Public invoice add-on toggles

The client link is `/invoices/{unique_hash}`. Qty and rate are hidden. Optional rows show a switch; required rows do not.

iMessage / Slack share title is `{company name} - Invoice for {first required line item}` (`Invoice::sharePreviewTitle()` in `eliteweblabs/crater`). If that repo still shows `New Invoice`, apply `plugins/billing/patches/invoice-share-preview.patch` with `git am`.

A row is optional from its **stored name** only (no `optional` column):

- `(optional)` or `[optional]` or `can be added anytime` → toggle
- `(required)` wins — never a toggle
- no tag → required, no switch

The public title strips those tags. Keep `(optional)` / `(required)` in the stored name. Quantity `0` = toggle starts off; `1` = starts on. When creating a proposal, tag add-ons `(optional)` and send quantity `0`.

The public **Download PDF** button is hidden on unpaid invoices that have add-on toggles — the PDF is generated from stored quantities, not the live switches. After payment (when `optional_item_ids` has been written) the button returns and the PDF is the receipt: qty-`0` add-ons omitted, tags stripped. Invoices with no optional rows keep the button the whole time.

`update_invoice` cannot rename a line. Use `PUT /api/custom/invoice/{invoiceId}/items/{itemId}` (name / description / quantity / price). Name-only edits do not change totals. Do not delete a SENT invoice to fix a typo.

Analytics add-on name is **Plausible Analytics**, never Phaseline.

Implementation: `src/lib/craterClient.ts` (HTTP) + `plugins/billing/agentTools.ts` (JSON schema + dispatch).
