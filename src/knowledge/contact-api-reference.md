# contact-api (reference)

Standalone service: **fuzzy contact identity** — `eliteweblabs/contact-api` on GitHub.

## Railway (Reave App only)

Use the **`contact-api`** + **`contact-postgres`** services inside the **Reave App** Railway project. That is the master client database for Reave work.

Typical public base URL pattern: `https://contact-api-production-<id>.up.railway.app` — do **not** hardcode; use a variable reference (below). On **Reave**, `contact-api` is usually configured with CORS like **`https://reave.app`** (`ALLOWED_ORIGINS`).

Older deployments under other projects are **out of scope** for this repo—point all consumers at **Reave App** `contact-api` only.

## Railway variable references (preferred)

Avoid pasting public URLs by hand. On the **Astro** (or any consumer) service → **Variables**, define:

```text
CONTACT_API_BASE_URL=https://${{ contact-api.RAILWAY_PUBLIC_DOMAIN }}
```

Use the **exact** service name as shown in Railway (autocomplete helps). Railway resolves `RAILWAY_PUBLIC_DOMAIN` on **contact-api** at deploy time; if the domain changes, consumers update automatically.

Official docs: [Reference variables](https://docs.railway.com/guides/variables#reference-variables).

### Optional API key

If **contact-api** enforces `API_KEY`, prefer a **shared variable** (Project → Shared Variables) e.g. `CONTACT_API_CLIENT_KEY`, then reference it on both services:

- On **contact-api**: `API_KEY=${{ shared.CONTACT_API_CLIENT_KEY }}` (or set `API_KEY` only there and share read-only to consumers — pattern depends on how you seal secrets).
- On **Astro**: `CONTACT_API_KEY=${{ shared.CONTACT_API_CLIENT_KEY }}`

So the client never stores a duplicate literal; one shared source, two references.

### Same-project private calls (optional)

For HTTP **inside** the Railway private network you can reference private hostnames instead of public URLs; your stack must listen on the right interface/port. Most setups still use `https://${{ contact-api.RAILWAY_PUBLIC_DOMAIN }}` for simplicity unless you intentionally use internal DNS.

## Env (Reave / Astro)

- `CONTACT_API_BASE_URL` — base URL for `contact-api` (no trailing slash). On Railway, prefer **`https://${{ contact-api.RAILWAY_PUBLIC_DOMAIN }}`** via variable reference.
- `CONTACT_API_KEY` — optional; sent as `X-API-Key` if contact-api requires it; prefer **shared variable + reference** above.

## Resolve (fuzzy name)

`POST /api/contacts/resolve` with JSON `{ "name", "email", "phone" }` (any subset).

Response `match`: `exact` | `likely` | `possible` | `none` (see upstream README).

## Update

`PATCH /api/contacts/:uid` with JSON `{ "name", "email", "phone", "company", "notes" }` — only provided keys are changed; old name/email/phone values are saved as aliases upstream.

## Delete

`DELETE /api/contacts/:uid` — soft-archives the contact (`archived = true`).

Telegram: `update_contact` and `delete_contact` tools (Reave checks linked jobs/invoices before delete; pass `force: true` to confirm).

Telegram shortcuts in this app: `/resolve <name>` and `/who <name>`.

## CardDAV (iOS sync)

The Reave Astro app exposes **CardDAV** at `/carddav` for native iPhone/iPad Contacts sync
(same data as this API). See bundled knowledge slug **`carddav`** for iOS setup and env vars
(`CARDDAV_USERNAME`, `CARDDAV_PASSWORD` on the Reave service).
