# Media drop folder — Mac and iPhone

The media library is stored in the app (Postgres), not as a disk you can open.
`/webdav` is a **WebDAV folder** over that library: mount it on a Mac or iPhone,
then drag images and PDFs in. They show up in **Admin → Media**.

## What it is

- **Endpoint:** `https://<site>/webdav`
- **Discovery:** `/.well-known/webdav` redirects to `/webdav/`
- **Source of truth:** `media_library` (same files as the admin Media tab)
- **Auth:** HTTP Basic (what Finder and the iOS Files app use). Clerk sessions do **not** work for WebDAV clients.
- **Types:** JPEG, PNG, GIF, WebP, SVG, PDF — max 10 MB each
- **Behavior:** PUT creates or replaces by filename; DELETE removes from the library; Finder junk (`.DS_Store`, `._*`) is ignored

## Credentials (Railway → Astro service Variables)

```text
MEDIA_WEBDAV_USERNAME=youruser
MEDIA_WEBDAV_PASSWORD=<long random password>
# Optional token for non-Finder clients:
# MEDIA_WEBDAV_TOKEN=
```

If those are unset, the drop folder **reuses CardDAV credentials** (`CARDDAV_USERNAME` / `CARDDAV_PASSWORD`) so one account can sync contacts and media.

Never paste the password into chat. `service_status` reports `media_webdav: true/false`.

## Mac (Finder)

**Go → Connect to Server… (⌘K)**

| Field | Value |
|-------|-------|
| **Server Address** | `https://<host>/webdav` |
| **Connect As** | Registered User |
| **Name** | `MEDIA_WEBDAV_USERNAME` (or CardDAV username) |
| **Password** | `MEDIA_WEBDAV_PASSWORD` |

The volume appears in the Finder sidebar. Drag files in; they appear in the Media library. Deleting a file in Finder removes it from the library (branding already applied is not undone).

## iPhone / iPad (Files)

**Files → Browse → ••• → Connect to Server**

| Field | Value |
|-------|-------|
| **Server** | `https://<host>/webdav` |
| **User Name** | `MEDIA_WEBDAV_USERNAME` |
| **Password** | `MEDIA_WEBDAV_PASSWORD` |

The location stays under **Shared** in Files. Save or drag photos and PDFs into it.

## Troubleshooting

- `https://<host>/webdav` should return **401** (not 404) when unauthenticated — that means the route is live.
- **503** means credentials are not set — add `MEDIA_WEBDAV_USERNAME` + `MEDIA_WEBDAV_PASSWORD`, or CardDAV creds.
- Finder “connection failed”: use the full `https://` URL including `/webdav`, not the hostname alone.
- iOS “Could not connect”: include `https://` and the `/webdav` path. There is no Advanced path field like CardDAV.
- Unsupported types and files over 10 MB are rejected; AppleDouble / `.DS_Store` uploads are silently dropped.

For the admin UI card, open **Media** — it shows the mount URL and whether the folder is configured.
