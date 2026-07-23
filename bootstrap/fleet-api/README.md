# fleet-api

Standalone service for **multi-vehicle fleet tracking** in Reave App. Stores vehicle registry, live GPS positions from signed-in Reave users, and location history.

Bootstrap source for **eliteweblabs/fleet-api** on GitHub (publish before connecting to Railway).

## Features

- Vehicle registry (name, plate, client link, assigned Clerk user)
- Location pings from Reave App when a signed-in user has an assigned vehicle
- Live fleet map data (`/api/locations/latest`)
- Location history per vehicle
- Auto-offline when no ping within `STALE_MINUTES`

## Quick start

```bash
cd bootstrap/fleet-api
npm install
cp .env.example .env
# Set DATABASE_URL (Postgres)
npm run dev
```

## Env

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string |
| `API_KEY` | Optional — Reave sends `X-API-Key` when set |
| `STALE_MINUTES` | Mark vehicles offline after N minutes without a ping (default 15) |
| `HISTORY_LIMIT` | Max history rows kept per vehicle (default 500) |

## Endpoints

| Method | Path | Body / query |
|--------|------|--------------|
| `GET` | `/health` | — |
| `GET` | `/api/vehicles` | `?assignedUserId=` |
| `POST` | `/api/vehicles` | `{ name, plate?, clientUid?, assignedUserId? }` |
| `PATCH` | `/api/vehicles/:id` | `{ name?, plate?, clientUid?, assignedUserId?, status? }` |
| `DELETE` | `/api/vehicles/:id` | — |
| `POST` | `/api/location` | `{ userId, lat, lng, heading?, speed?, accuracy? }` |
| `GET` | `/api/locations/latest` | fleet summary + all vehicles |
| `GET` | `/api/vehicles/:id/history` | `?limit=50` |

## Railway (Reave App)

1. Push this repo to GitHub (`eliteweblabs/fleet-api`)
2. Reave App project → **New service** → connect the repo
3. Add Postgres (or reference existing) → `DATABASE_URL`
4. Set `API_KEY` (shared variable pattern)
5. On Astro: `FLEET_API_BASE_URL=https://${{ fleet-api.RAILWAY_PUBLIC_DOMAIN }}`

See `src/knowledge/fleet-api-reference.md` in the [reave](https://github.com/eliteweblabs/reave) repo.

## Publish to GitHub

```sh
cd bootstrap/fleet-api
git init && git add -A && git commit -m "Initial fleet-api"
gh repo create eliteweblabs/fleet-api --public --source=. --remote=origin --push
```
