# Demo install — Railway quick start

Use this playbook when standing up a **Reave Demo** environment on Railway for sales presentations or QA.

## What demo mode does

When `DEMO_MODE=1` or `INSTALL_CONFIG=demo`:

- The **demo plugin** is active (agent tools: `get_demo_setup_status`, `run_demo_seed`)
- `GET/POST /api/admin/demo` reports readiness and triggers seeding (deployment owner only)
- `config/config-demo.json` enables a trimmed feature set suited for demos

Demo data is **CLI-driven** via `npm run seed:demo` (same logic the API/agent call).

## Railway project checklist

### 1. Create the project

- New Railway project (separate from production **Reave App**)
- Connect GitHub repo `eliteweblabs/reave` → deploy **Astro** service from `Dockerfile`
- Add **Postgres** plugin → copy `DATABASE_URL` to Astro vars

### 2. Sibling services (minimum)

| Service | Required for | Notes |
|---------|--------------|-------|
| **contact-api** | Client seeding | Set `CONTACT_API_BASE_URL` + `CONTACT_API_KEY` on Astro |
| **Cal.com** | Schedule tab + `--with-bookings` | Optional for first pass |
| **Crater** | Finance tab | Optional — billing tools need `CRATER_*` |

### 3. Core Astro env vars

```env
DEMO_MODE=1
INSTALL_CONFIG=demo
PUBLIC_SITE_DOMAIN=your-demo.up.railway.app

DATABASE_URL=<postgres public URL>
CONTACT_API_BASE_URL=https://<contact-api>.up.railway.app
CONTACT_API_KEY=<shared secret>

# Clerk — use a test instance or separate keys from production
PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...

# After first sign-in, set your Clerk user id (owner + demo chat owner)
AGENT_ALERT_USER_ID=user_...

# Live client-portal demo on your phone
DEMO_REAL_CONTACT_EMAIL=you@yourcompany.com
DEMO_REAL_CONTACT_NAME=Your Name
DEMO_REAL_CONTACT_PHONE=+15551234567
```

### 4. First deploy → quick start wizard

1. Sign in to `/admin/` on the demo domain
2. Open **Admin → Chats** and ask the agent: *"Run demo quick start"* — it will call `get_demo_setup_status`, guide missing env vars, then `run_demo_seed` with `fresh=true`
3. Or from Railway shell / local with demo `.env`:
   ```sh
   npm run seed:demo -- --fresh --force-company
   ```

### 5. Company branding

Seed sets **Reave Demo Co.** when `--force-company` or company name is empty. For a custom demo brand:

1. Admin → Profile → **Company** — set name, domain, support email
2. Re-run seed without `--force-company`, or set company first then seed

## Seed script flags

```sh
npm run seed:demo              # populate dashboard
npm run seed:demo -- --fresh   # wipe prior demo rows first
npm run seed:demo -- --force-company
npm run seed:demo -- --with-bookings
npm run seed:demo -- --dry-run
```

## Safety

- Fake contacts use `@demo.reave.app` / `*.demo` emails — `--fresh` only deletes those
- Your **real** contact (`DEMO_REAL_CONTACT_EMAIL`) is preserved on `--fresh`
- Demo projects are tagged `source = 'demo'` in Postgres

## Production vs demo

| | Reave App (prod) | Reave Demo (testing) |
|--|------------------|----------------------|
| Domain | reave.app | *.up.railway.app or demo subdomain |
| Config | `config-reave.json` | `config-demo.json` |
| Data | Real clients | Seeded fixtures |
| `DEMO_MODE` | unset | `1` |

Never point production `DATABASE_URL` at a demo seed run.
