# Deployment punch list

Master playbook for standing up a Reave install on Railway. Tailor per client by selecting modules, then generate a trimmed checklist:

```bash
npm run deploy:checklist -- --install demo --modules scheduling,vapi,billing
npm run deploy:checklist -- --install demo --all
```

Module **numeric ids** (for demo URLs) are listed in the module picker below. Full catalog: [`src/lib/demoModuleCatalog.ts`](../src/lib/demoModuleCatalog.ts).

Per-module playbooks live in `plugins/*/DEPLOY.md` and `config/modules/*.DEPLOY.md`. Per-install **status** overrides go in `config/config-{slug}.json` → `moduleStatus` (production clients). **Demo installs** derive enabled modules and status from URL params / cookie — see [`plugins/demo/knowledge/demo-module-ids.md`](../plugins/demo/knowledge/demo-module-ids.md).

---

## Module picker

Check modules for this client, then run `npm run deploy:checklist`:

| ID | Feature | Label |
|----|---------|-------|
| 001 | `client_portal` | Client portal |
| 002 | `web_handoff` | Portal Data tab |
| 003 | `portal_assistant` | Portal help chat |
| 004 | `billing` | Crater billing |
| 005 | `site_audits` | Website Audit |
| 006 | `site_monitoring` | ChangeDetection.io |
| 007 | `uptime_monitoring` | UptimeRobot |
| 008 | `documents` | Document signing |
| 009 | `voice` | Telnyx voice agent |
| 010 | `vapi` | Vapi assistant |
| 011 | `carddav` | CardDAV sync |
| 012 | `scheduling` | Cal.com scheduling |
| 013 | `dev_infra` | Git / Railway / Kinsta |
| 014 | `code_dev` | Local code tools |
| 015 | `email_marketing` | Newsletter automation |
| 016 | `fleet_tracking` | Fleet GPS |
| 017 | `dealership_wizard` | Paulino wizard |
| 018 | `namecom_dns` | Name.com DNS |
| 019 | `time_tracking` | Project time log |
| 020 | `demo` | Demo mode |
| 021 | `real_estate_data` | Lead scanner |
| 022 | `inventory_sync` | Inventory sync |
| 023 | `online_reviews` | Google reviews inbox |
| 024 | `wayback_machine` | Wayback Machine |
| 025 | `stock_photos` | Pexels stock photos |

**Demo suite URL** (stores config in cookie → redirects to admin):

```
https://your-domain/?demo=tier-1&modules=[001,004,006,009]&industry=plumbing
```

Then sign in and run demo seed (owner): `POST /api/admin/demo` with `{ "fresh": true }` or ask the agent to *run demo seed*.

---

## Step 1 — App core (get it loading + admin sign-in)

Minimum to run Astro + `/admin/` on Railway.

| Area | Variables / actions |
|------|---------------------|
| Railway project | Astro service from `Dockerfile`, Postgres plugin |
| Database | `DATABASE_URL` |
| Auth | `PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `PUBLIC_CLERK_ALLOW_SIGN_UP` |
| Install identity | `INSTALL_CONFIG` (e.g. `demo`), `PUBLIC_SITE_URL` / domain |
| Contacts (always on) | `CONTACT_API_BASE_URL`, `CONTACT_API_KEY` + deploy **contact-api** sibling |
| Email inbox (always on) | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `RESEND_FROM` + Resend webhook → `/api/email/inbound` |
| Agent / alerts | `ANTHROPIC_API_KEY`, `AGENT_ALERT_USER_ID` (set after first Clerk sign-in) |
| Clerk dashboard | Allowed origins for Railway domain |

**Smoke test:** sign in → open Chats → confirm Postgres tables init.

---

## Step 2 — Client baseline (typical paying install)

Not required for bare demo load; expected for real clients.

| Area | Variables |
|------|-----------|
| Branding | Admin → Company — also `COMPANY_*` env fallbacks |
| PWA push | `VAPID_*`, `VAPID_SUBJECT`, `PUSH_ENABLED` |
| Maps / places | `GOOGLE_MAPS_API_KEY`, `PUBLIC_MAPBOX_ACCESS_TOKEN` |
| Contacts PII gate | `DASHBOARD_KEY` |
| CardDAV (if feature on) | `CARDDAV_USERNAME`, `CARDDAV_PASSWORD` |
| Agent tools | `BRAVE_API_KEY`, `PEXELS_API_KEY`, `SIRI_API_KEY` |
| Email tuning | `EMAIL_ALLOWED_*`, `EMAIL_AI_ENABLED` |
| Cloudflare DNS (optional) | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` |

**Audit:** Railway vars `ENDPOINT`, `REGION`, `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `EMAIL_NOTIFY_CHAT_ID`, `FEATURES` are not referenced in app code — confirm/remove or document if used by a sibling service.

---

## Step 3 — Add-ons (module-gated)

Enable feature in `config/config-{slug}.json` → set env vars → set `moduleStatus.{feature}` → `deployed`.

| Module | Playbook | Key env / services |
|--------|----------|-------------------|
| `scheduling` | [plugins/scheduling/DEPLOY.md](../plugins/scheduling/DEPLOY.md) | `BOOKING_API_URL`, `CALCOM_*`, calcom-booking-api |
| `billing` | [plugins/billing/DEPLOY.md](../plugins/billing/DEPLOY.md) | `CRATER_*`, Crater service |
| `voice` | [config/modules/voice.DEPLOY.md](../config/modules/voice.DEPLOY.md) | `TELNYX_*`, `VOICE_AGENT_ENABLED` |
| `vapi` | [plugins/vapi/DEPLOY.md](../plugins/vapi/DEPLOY.md) | `VAPI_API_KEY`, `PUBLIC_VAPI_*` |
| `site_audits` | [plugins/site-audits/DEPLOY.md](../plugins/site-audits/DEPLOY.md) | `GOOGLE_PAGESPEED_API_KEY` |
| `site_monitoring` | [plugins/site-monitoring/DEPLOY.md](../plugins/site-monitoring/DEPLOY.md) | `CHANGEDETECTION_*` |
| `uptime_monitoring` | [plugins/uptime-monitoring/DEPLOY.md](../plugins/uptime-monitoring/DEPLOY.md) | `UPTIMEROBOT_*` |
| `email_marketing` | [plugins/email-marketing/DEPLOY.md](../plugins/email-marketing/DEPLOY.md) | `NEWSLETTER_*` |
| `dev_infra` | [plugins/dev-infra/DEPLOY.md](../plugins/dev-infra/DEPLOY.md) | `GITHUB_TOKEN`, `RAILWAY_*`, `KINSTA_*` |
| `demo` | [plugins/demo/DEPLOY.md](../plugins/demo/DEPLOY.md) | `DEMO_MODE`, `DEMO_REAL_CONTACT_*` |
| … | See `plugins/*/DEPLOY.md` | |

**Runtime status:** non-`deployed` enabled modules show a global banner. API routes return 503 when status is `request` or `rejected`. Check status: `GET /api/admin/deploy-status`.

---

## Generated checklists

Output directory: [`docs/deploy-checklists/`](deploy-checklists/)

Example for the current demo install:

```bash
npm run deploy:checklist -- --install demo --all --out docs/deploy-checklists/demo-baseline.md
```
