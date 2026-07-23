# Paulino Auto Group — dealership wizard

Inventory sync, swipe-to-browse UI, lead/deal wizard, and test-drive requests for **Paulino Auto Group** (Fitchburg, MA).

Standalone service: **eliteweblabs/paulino-wizard** on GitHub, deployed on Railway (Paulino Auto Group project).

Live app: **https://paulino-wizard-production.up.railway.app**

## Enable in Reave

1. Add **`dealership_wizard`** to install config `features`.
2. Set on Astro (Reave App):

```text
PAULINO_WIZARD_API_BASE_URL=https://paulino-wizard-production.up.railway.app
```

Optional **`PAULINO_WIZARD_API_KEY`** when admin routes require auth (inventory sync/scrape).

## What paulino-wizard does

- **Inventory sync** — scrapes DealerSocket inventory from paulinoautogroup.com into Postgres
- **Public inventory API** — `GET /api/vehicles` with `search`, `make`, `max_price`, `condition`, `limit`
- **Lead + deal wizard** — `POST /api/leads` returns a magic link; customer completes 6 steps (Vehicle → Contact → Trade-In → Credit → Documents → Deposit)
- **Test drives** — `POST /api/booking/create` with `leadToken` + `preferred_time` (plain language OK)
- **Swipe UI** — mobile Tinder-style inventory browser at `/`
- **Vapi** — voice widget embedded on the inventory page
- **Admin** — `/admin` for sync status and inventory refresh

## Agent tools (Reave admin chat)

| Tool | Purpose |
|------|---------|
| `search_dealership_inventory` | Find vehicles by make, price, condition, keywords |
| `create_dealership_lead` | Start deal flow; returns `token` + `magicLink` |
| `get_dealership_deal` | Read deal state by token |
| `book_dealership_test_drive` | Save test-drive request for a lead |

## Typical voice/chat flow

1. Caller asks for a red SUV under $25k → `search_dealership_inventory`
2. They pick one → `create_dealership_lead` with name + phone (+ optional `vehicle_id`)
3. Share the **magicLink** by SMS or read it aloud
4. They want a test drive → `book_dealership_test_drive` with `leadToken` + `preferred_time`

## Railway project

Separate from **Reave App** (`reave.app`):

- Project: `c2bf8474-72c1-4d1a-b546-ecf7f4de986a`
- Service: `paulino-wizard` → `paulino-wizard-production.up.railway.app`

Source repo: **eliteweblabs/paulino-wizard** (private).
