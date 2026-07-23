# fleet-api (agent knowledge)

Standalone service: **eliteweblabs/fleet-api** on GitHub.

Tracks multiple business vehicles. Each vehicle can be assigned to a Clerk user id. When that user is signed into Reave App, their device reports GPS via Reave → fleet-api.

## Railway

Add **fleet-api** in the Reave App project with Postgres (`DATABASE_URL`) and optional `API_KEY`.

On Astro:

```text
FLEET_API_BASE_URL=https://${{ fleet-api.RAILWAY_PUBLIC_DOMAIN }}
FLEET_API_KEY=${{ shared.FLEET_API_CLIENT_KEY }}
```

Enable the Reave plugin: `"fleet_tracking"` in install config features.

## Workflow

1. Admin adds vehicles in the Fleet tab (or agent tool `list_fleet_vehicles` / `create_fleet_vehicle`)
2. Assign each vehicle to a driver’s Clerk `userId`
3. Driver opens Reave App while signed in — location pings automatically when they have an assigned vehicle
4. Admin views all vehicles on the Fleet map tab

## Agent tools

- `list_fleet_vehicles` — all vehicles + last seen
- `create_fleet_vehicle` — `{ name, plate?, clientUid?, assignedUserId? }`

## Client linking

Set `clientUid` on a vehicle to tie it to a contact (same uid as CRM / client portal).
