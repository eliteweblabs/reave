# paulino-wizard (reference)

Standalone service: **eliteweblabs/paulino-wizard** on GitHub (private).

Dealership inventory, lead/deal wizard, and test-drive requests for Paulino Auto Group.

## Railway (Paulino Auto Group project)

Deploy from **eliteweblabs/paulino-wizard** — separate Railway project from Reave App.

Public URL (production): `https://paulino-wizard-production.up.railway.app`

On the **Reave Astro** consumer → **Variables**:

```text
PAULINO_WIZARD_API_BASE_URL=https://paulino-wizard-production.up.railway.app
```

## Install config

```json
{
  "features": ["dealership_wizard", "..."]
}
```

## Env (Reave / Astro)

- `PAULINO_WIZARD_API_BASE_URL` — base URL (no trailing slash)
- `PAULINO_WIZARD_API_KEY` — optional; for authenticated admin/sync routes

## Public API (no auth)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/vehicles` | List/search inventory (`search`, `make`, `max_price`, `condition`, `limit`) |
| `POST` | `/api/leads` | Create lead → `{ token, magicLink, lead }` |
| `GET` | `/api/deals/:token` | Deal wizard state |
| `PATCH` | `/api/deals/:token` | Update deal (vehicle, step, contact fields) |
| `POST` | `/api/booking/create` | Test-drive request (`leadToken`, `preferred_time`, …) |
| `GET` | `/api/booking/by-lead/:token` | Pending test-drive for lead |

## Vehicle fields

| Field | Purpose |
|-------|---------|
| `id` | Internal inventory id |
| `site_id` | DealerSocket listing id |
| `name` | Display title (year make model) |
| `price`, `mileage`, `color`, `vin`, `stock` | Listing details |
| `vehicle_condition` | `new` or `used` |
| `url` | Link to paulinoautogroup.com listing |
| `image_url` | Primary photo |

## Deal wizard steps

1. Vehicle — pick from synced inventory
2. Contact — name, phone, email
3. Trade-In
4. Credit
5. Documents
6. Deposit

## Health check

No `/health` route. Reave probes `GET /api/vehicles?limit=1` when `dealership_wizard` is enabled.
