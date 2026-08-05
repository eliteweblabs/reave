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
- `INSTALL_CONFIG=demo` — loads `config/config-demo.json`
- `DEMO_REAL_CONTACT_EMAIL` — one real contact for live demos
- `DEMO_REAL_CONTACT_NAME` — display name for demo contact
- `DEMO_REAL_CONTACT_PHONE` — optional phone for demo contact

## External setup

- Create a separate Railway project from production Reave App
- Enable `demo` in install config `features[]`
- **Demo suite URL** — industry + module picker for sales:
  `/?demo=tier-1&modules=[001,004,006,009]&industry=plumbing`
  Redirects to admin, stores suite in cookie, then run seed with `{ fresh: true }`
- Run `npm run seed:demo -- --industry plumbing --module-ids 001,004,006,009` or Admin → Demo seed

## Checklist

- [ ] Set `DEMO_MODE=1` and `INSTALL_CONFIG=demo`
- [ ] Deploy sibling services (minimum: contact-api + Postgres)
- [ ] Run demo seed and verify dashboard data
- [ ] Set `moduleStatus.demo` → `deployed` in install config
