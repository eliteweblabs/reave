# CardDAV — native iOS Contacts sync

Sync the master **contact-api** client list to iPhone/iPad **Contacts** without Google
or iCloud for that account. The Reave Astro app exposes a CardDAV server at `/carddav`
(RFC 6352) backed by the same contacts as Telegram tools (`list_contacts`,
`resolve_contact`, etc.).

## What it is

- **Endpoint:** `https://<site>/carddav/` (production: `https://reave.app/carddav/`)
- **Discovery:** `/.well-known/carddav` redirects to `/carddav/` (RFC 6764)
- **Format:** vCard 3.0 per contact at `/carddav/addressbooks/{user}/default/{uid}.vcf`
- **Source of truth:** contact-api (Reave App). CardDAV is a read/write sync layer —
  GET/REPORT pull contacts; PUT creates/updates; DELETE removes. Archived contacts are
  omitted from sync.
- **Auth:** HTTP Basic Auth (what iOS uses) or token headers (`X-CardDAV-Token`,
  `X-API-Key`, `Authorization: Bearer`). Clerk sessions do **not** work for CardDAV
  clients.

## iOS setup

**Settings → Contacts → Accounts → Add Account → Other → CardDAV Account**

| Field | Value |
|-------|-------|
| **Server** | `reave.app` (or `RAILWAY_PUBLIC_DOMAIN` / `PUBLIC_SITE_URL` host) |
| **User Name** | `CARDDAV_USERNAME` |
| **Password** | `CARDDAV_PASSWORD` |
| **Description** | Reave Contacts (optional) |

Tap **Advanced** before Save — this is required on iOS for Reave:

| Advanced field | Value |
|----------------|-------|
| **Use SSL** | On |
| **Port** | `443` |
| **Account URL** / **Path** | `/carddav` |

Keep the server field as the hostname only (`reave.app`), not a full URL with path.

**Verification failed?** If the server route is healthy (`https://reave.app/carddav/`
returns 401, not 404), the fix is almost always the Advanced path above — not the
password or cert.

After saving, iOS runs PROPFIND/REPORT against the server and imports vCards. Edits on
the phone sync back via PUT/DELETE.

## Environment (Reave Astro service on Railway)

Requires **contact-api** (`CONTACT_API_BASE_URL`).

```text
CONTACT_API_BASE_URL=https://${{ contact-api.RAILWAY_PUBLIC_DOMAIN }}
CONTACT_API_KEY=${{ shared.CONTACT_API_CLIENT_KEY }}   # if contact-api enforces API_KEY

CARDDAV_USERNAME=youruser
CARDDAV_PASSWORD=<long random password>
# Optional — token auth for non-iOS clients; defaults to CONTACT_API_KEY if unset:
# CARDDAV_TOKEN=
```

`service_status` (via `run_dev_task`) reports `carddav: true/false` when credentials
are set. CardDAV also needs contact-api reachable.

## Supported methods

| Method | Purpose |
|--------|---------|
| OPTIONS | DAV capabilities |
| PROPFIND | Principal + addressbook discovery, etags |
| REPORT | `addressbook-query`, `addressbook-multiget`, `sync-collection` |
| GET | Fetch one vCard |
| PUT | Create/update contact (includes `NOTE` / internal notes on sync) |
| DELETE | Delete contact |

## URL layout

```
/carddav/
/carddav/principals/{username}/
/carddav/addressbooks/{username}/default/
/carddav/addressbooks/{username}/default/{uid}.vcf
```

`{username}` matches `CARDDAV_USERNAME`.

## Notes for the assistant

- **Do not paste** `CARDDAV_PASSWORD` or API keys in Telegram — point the owner to
  Railway → Reave service → Variables.
- CardDAV is for **staff** syncing the master client list on a personal device — not
  for sending links to clients (use **client portal** `/c/<uid>` for that).
- If iOS fails to verify the account: confirm deploy is live, `carddav` is true in
  `service_status`, contact-api answers `ping_contact_api`, and username/password match
  env vars exactly.
- New contacts created on iOS may get a server-assigned `uid` from contact-api; the
  `Location` response header is the canonical href.

## Related docs

- `contact-api-reference.md` — upstream API + env references
- `client-portal.md` — shareable client pages (separate from CardDAV)
