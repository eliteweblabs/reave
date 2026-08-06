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

## Clerk (demo.reave.app)

Use **production** Clerk keys (`pk_live_` / `sk_live_`) — same instance as `reave.app`. Do **not** use the development/test instance on a deployed custom domain; its dev-browser handshake fails on non-localhost origins.

Also set on the demo Railway service:

- Add `https://demo.reave.app` to the production Clerk instance **Allowed origins** (Clerk Dashboard or Backend API `PATCH /v1/instance`)

Satellite domains are **not** required on the current plan; allowed origins is enough for sign-in from `demo.reave.app`.

Use the same username/password as production. Enter **both** fields and click **Continue** — submitting the identifier alone sends Clerk to its `#/factor-one` step, which on this instance only offers Google.

`PUBLIC_CLERK_JS_VERSION` / `CLERK_API_VERSION` do **not** need to be set. They were added chasing a "stale clerk-js sends an invalid `__clerk_api_version`" theory that does not hold up: clerk-js 6.27.0 sends `2026-05-12` and the Frontend API answers `200` with `clerk-api-version: 2026-05-12`. A version pin only guarantees the deploy falls behind the `@clerk/astro` in `package.json`. When sign-in breaks, triage it for real — see `read_knowledge slug "clerk-sign-in-triage"`.

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
- [ ] Deploy sibling services (minimum: contact-api + Postgres)
- [ ] Run demo seed and verify dashboard data
