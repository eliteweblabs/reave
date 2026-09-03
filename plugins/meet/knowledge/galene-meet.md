# Galene video meet

Self-hosted [Galene](https://galene.org/) on Railway at **meet.{apex}** (service `galene`, monorepo root `galene-railway/` in `eliteweblabs/reave`).

## Auth

- **Server admin API:** HTTP Basic — `GALENE_ADMIN_USERNAME` (default `admin`) + `GALENE_ADMIN_PASSWORD` (shared with Reave).
- **Room moderator:** username `host`, password `GALENE_GROUP_PASSWORD` on the Galene service.
- **Guests:** any username except `host`, any password (wildcard user).

## Env (Reave / Astro)

| Variable | Purpose |
|----------|---------|
| `GALENE_API_BASE_URL` | Public Galene host, no trailing slash (`https://meet.reave.app`). |
| `GALENE_ADMIN_PASSWORD` | Same as Galene service — Basic auth for `/galene-api/v0/`. |
| `GALENE_ADMIN_USERNAME` | Optional (default `admin`). |

## Env (Galene service)

| Variable | Purpose |
|----------|---------|
| `REAVE_APP_URL` | Reave origin for `GET /api/branding` (logo + colors on boot). |
| `GALENE_PUBLIC_URL` | Public URL (`https://meet.{apex}/`). |
| `GALENE_CANONICAL_HOST` | `meet.{apex}` when using custom domain. |
| `GALENE_ADMIN_PASSWORD` | Shared with Reave. |
| `GALENE_GROUP_PASSWORD` | Moderator (`host`) room password. |

## Branding

On container start, `docker-entrypoint.sh` pulls `GET {REAVE_APP_URL}/api/branding`, writes `/reave-brand.css`, downloads **`logoDarkUrl`** (light wordmark for dark chrome) to `/reave-logo.png`, injects `<img class="reave-wordmark">` into `galene.html`, and links the stylesheet.

## Admin UI

Footer tab **Meet** opens the Galene host (`window.__galeneMeetUrl` or `https://meet.{domain}`).

## Agent tools

| Tool | Action |
|------|--------|
| `list_meeting_rooms` | GET `/galene-api/v0/.groups/` |
| `create_meeting_room` | PUT group + host/wildcard users |
| `create_meeting_invite` | POST stateful token → share URL with `?token=` |

Default room: `/group/meet/`.
