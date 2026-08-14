---
feature: demo
defaultStatus: development
stage: 1
---

# Demo mode deployment

## Sibling services

- **contact-api** — required for client seeding
- **Crater**, **Cal.com** — optional for finance/schedule demos

## Required env vars

- `DEMO_MODE=1` — enables demo plugin and seed tooling
- `INSTALL_CONFIG=demo` — loads `config/config-demo.json` (UI shell only; modules come from URL)
- `DEMO_REAL_CONTACT_EMAIL` — one real contact for live demos
- `DEMO_REAL_CONTACT_NAME` — display name for demo contact
- `DEMO_REAL_CONTACT_PHONE` — optional phone for demo contact

## External setup

- Create a separate Railway project from production Reave App
- Enable `demo` in install config `features[]` (only module in `config-demo.json`)
- **Module IDs** — see [`plugins/demo/knowledge/demo-module-ids.md`](knowledge/demo-module-ids.md) or `GET /api/demo/suite`
- **Demo suite URL** — pick modules + industry for each client pitch:
  `/?demo=tier-1&modules=[001,004,006,009]&industry=plumbing`
  Redirects to admin, stores suite in cookie, enables only those modules, then run seed with `{ fresh: true }`
- Run `npm run seed:demo -- --industry plumbing --module-ids 001,004,006,009` or Admin → Demo seed

## Checklist

- [ ] Set `DEMO_MODE=1` and `INSTALL_CONFIG=demo`
- [ ] Deploy sibling services (minimum: contact-api + its own Postgres)
- [ ] Confirm `GET /api/contacts` returns 200 before seeding clients
- [ ] Run demo seed and verify dashboard data
