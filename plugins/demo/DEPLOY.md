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

- `PUBLIC_CLERK_JS_VERSION=6.27.0` — pins clerk-js so the Frontend API uses a supported version (unpinned `@6` can serve stale JS that sends invalid `__clerk_api_version=2024-05-12` → 400 on `sign_ins`)
- `CLERK_API_VERSION=2025-04-10` — backend API version aligned with clerk-js 6.x
- Add `https://demo.reave.app` to the production Clerk instance **Allowed origins** (Clerk Dashboard or Backend API `PATCH /v1/instance`)

Satellite domains are **not** required on the current plan; allowed origins is enough for sign-in from `demo.reave.app`.

**Sign-in flow:** This Clerk instance uses **Google OAuth only** (password is disabled). The demo admin redirects to `https://reave.app/sign-in` with a `returnTo` back to demo — do not embed the Clerk form on demo directly.

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
