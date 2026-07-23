# Fleet tracking

Multi-vehicle GPS monitoring for businesses with field crews, delivery vans, or service trucks.

## How it works

1. Enable **`fleet_tracking`** in install config and deploy **fleet-api** on Railway.
2. Register vehicles in the admin **Fleet** tab (or agent tools).
3. Assign each vehicle to a **Clerk user id** (the driver’s Reave sign-in).
4. When that user opens Reave App while signed in, their device sends GPS pings.
5. Dispatchers see all vehicles on the live fleet map.

## Setup (Railway)

Add **fleet-api** to the Reave App project with Postgres. On Astro:

```text
FLEET_API_BASE_URL=https://${{ fleet-api.RAILWAY_PUBLIC_DOMAIN }}
FLEET_API_KEY=${{ shared.FLEET_API_CLIENT_KEY }}
```

Publish the bootstrap repo:

```sh
cd bootstrap/fleet-api
gh repo create eliteweblabs/fleet-api --public --source=. --remote=origin --push
```

## Vehicle fields

| Field | Purpose |
|-------|---------|
| `name` | Display label on map and lists |
| `plate` | License plate (optional) |
| `clientUid` | Link to CRM contact when vehicle serves a specific client |
| `assignedUserId` | Clerk user id — location reports when this user is signed in |

## Status

- **active** — received a location ping recently
- **offline** — no ping within `STALE_MINUTES` (default 15)
- **idle** — registered but never reported location

## Agent tools

- `list_fleet_vehicles` — summary + all vehicles with last position
- `create_fleet_vehicle` — add a vehicle to the registry

## API (via Reave proxy)

Clerk-authenticated routes under `/api/fleet/*` — see `fleet-api-reference` knowledge slug.

## Privacy

Location is collected only for users with an assigned vehicle, while signed into Reave App. Drivers should be informed per your company policy.
