# fleet-api (reference)

Standalone service: **eliteweblabs/fleet-api** on GitHub.

Bootstrap source (before the GitHub repo exists): `bootstrap/fleet-api/` in this repo.

## Railway (Reave App)

Add a **`fleet-api`** service in the **Reave App** Railway project with Postgres (`DATABASE_URL`).

On the **Astro** consumer → **Variables**:

```text
FLEET_API_BASE_URL=https://${{ fleet-api.RAILWAY_PUBLIC_DOMAIN }}
FLEET_API_KEY=${{ shared.FLEET_API_CLIENT_KEY }}
```

Prefer Railway **reference variables** over pasted URLs.

### Optional API key (shared variable pattern)

- On **fleet-api**: `API_KEY=${{ shared.FLEET_API_CLIENT_KEY }}`
- On **Astro**: `FLEET_API_KEY=${{ shared.FLEET_API_CLIENT_KEY }}`

Client sends `X-API-Key` when `FLEET_API_KEY` is set.

## Install config

Enable the plugin in `config/config-{slug}.json`:

```json
{
  "features": ["fleet_tracking", "..."],
  "footerNav": ["__system__", "...", "fleet"]
}
```

## Env (Reave / Astro)

- `FLEET_API_BASE_URL` — base URL for fleet-api (no trailing slash)
- `FLEET_API_KEY` — optional; sent as `X-API-Key`

## Reave proxy routes (Clerk auth)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/fleet/vehicles` | List vehicles (`?mine=1` for current user’s assignment) |
| `POST` | `/api/fleet/vehicles` | Create vehicle |
| `PATCH` | `/api/fleet/vehicles/:id` | Update vehicle |
| `DELETE` | `/api/fleet/vehicles/:id` | Remove vehicle |
| `POST` | `/api/fleet/location` | GPS ping from signed-in user’s device |
| `GET` | `/api/fleet/map` | Fleet summary + latest positions for map |

## Upstream (fleet-api)

| Method | Path | Body |
|--------|------|------|
| `GET` | `/health` | — |
| `GET` | `/api/vehicles` | `?assignedUserId=` |
| `POST` | `/api/vehicles` | `{ name, plate?, clientUid?, assignedUserId? }` |
| `PATCH` | `/api/vehicles/:id` | patch fields |
| `POST` | `/api/location` | `{ userId, lat, lng, heading?, speed?, accuracy? }` |
| `GET` | `/api/locations/latest` | fleet summary |

## Client library

`src/lib/fleetClient.ts`:

- `isFleetApiConfigured()`
- `fleetListVehicles()`, `fleetCreateVehicle()`, `fleetUpdateVehicle()`, `fleetDeleteVehicle()`
- `fleetRecordLocation()`, `fleetLatestLocations()`, `fleetVehicleHistory()`

## Publish the GitHub repo

```sh
cd bootstrap/fleet-api
git init && git add -A && git commit -m "Initial fleet-api"
gh repo create eliteweblabs/fleet-api --public --source=. --remote=origin --push
```

Then connect the repo to a new Railway service in Reave App.

## Location flow

1. Admin assigns vehicle → Clerk `userId`
2. User signs into Reave App (admin PWA)
3. Browser `navigator.geolocation` reports position → `POST /api/fleet/location`
4. Reave forwards to fleet-api with the authenticated `userId`
5. Fleet map tab polls `GET /api/fleet/map` for live positions
