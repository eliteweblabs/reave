# Client portal (shareable client pages)

A lightweight, **iOS-first** way to keep client info in one place and share it with
them via a link. Most clients are on iPhone, so the page is built to look great in
Safari and to support **Add to Home Screen** (it behaves like a little app with the
client's name).

## What it is

- **Every client has a page by default** at `https://reave.app/c/<uid>` where
  `<uid>` is the contact's UUID from `contact-api`. Nothing to "create" — the link
  works for any contact. The uid is random/unguessable, so the link itself is the
  access token — only people you send it to can open it. The page is `noindex`.
  Customizing content (headline/body/fields) is optional; setting `enabled:false`
  hides/revokes a page.
- **Source of truth:** `contact-api` (Reave App). No new database — the
  client-facing content is stored as a `portal` **link** on the contact
  (`contact_links`, `system='portal'`, JSONB `metadata`). This is **separate from
  the private internal `notes` field**, so internal notes never leak to clients.
- **Rendered server-side** so the `CONTACT_API_KEY` stays on the server.

## Portal content (`metadata`)

```jsonc
{
  "enabled": true,            // false → link returns 404 (revoked)
  "headline": "Your project", // short title at the top
  "body": "Free text…",       // newlines + URLs preserved/auto-linked
  "fields": [                  // optional labeled rows
    { "label": "Site URL", "value": "https://acme.com" },
    { "label": "Plan", "value": "Annual hosting" }
  ],
  "updatedAt": "2026-…"       // set automatically on save
}
```

The page also shows tap-to-**Call / Text / Email** actions from the contact's
phone/email, a **Save** action, plus the client name and company.

## vCard export (`/c/<uid>.vcf`)

The **Save** button (and the direct URL `https://reave.app/c/<uid>.vcf`) returns a
vCard 3.0 that opens natively in **iOS Contacts** ("Add to Contacts"). It includes
only client-safe fields — name, company, phone, email, and the portal URL — never
the internal `notes`. Same gating as the page (portal must exist and not be
revoked).

## Manage it from Telegram

With `ANTHROPIC_API_KEY` + `CONTACT_API_BASE_URL` set, the bot has these tools:

- **`list_contacts`** — list/search all clients; each row includes its
  `portal_url`. (Every client already has a page.)
- **`set_client_portal`** — customize a client's portal content, or hide it
  (`enabled:false`). Identify by `uid` or by `name` (fuzzy-resolved; if ambiguous
  it returns candidates to confirm). Updates merge with existing content.
- **`get_client_portal`** — fetch the link + current content for one client.

Examples (freeform to the bot):

- "Make a client page for Tony Vello with the headline 'Hosting & support' and a
  field Site URL → https://tonyvello.com" → returns the link to send him.
- "What's the portal link for Acme?" → returns `https://reave.app/c/<uid>`.
- "Hide Acme's client page" → sets `enabled:false`.

## Env

- `CONTACT_API_BASE_URL` / `CONTACT_API_KEY` — already used for contact resolve.
- `PUBLIC_SITE_URL` — origin for building share links (defaults to
  `https://${RAILWAY_PUBLIC_DOMAIN}`, then `https://reave.app`).

## Why not Apple Notes?

Apple Notes has **no public/server API** (no CloudKit access, AppleScript is
Mac-only). A shareable web page is more flexible: you stay the single source of
truth, updates are instant, and on iOS it still installs to the Home Screen.
