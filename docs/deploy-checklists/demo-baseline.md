# Deploy checklist — demo

Generated: 2026-08-05T00:20:53.084Z

> Contacts, email inbox, work/jobs, knowledge, personal to-dos, and chat are always on.

## Module picker (numeric ids for demo URLs)

- [ ] **001** — Client portal (/c/:uid) (`client_portal`)
- [ ] **002** — Portal Data tab (handoff creds) (`web_handoff`)
- [ ] **003** — Client portal help chat (`portal_assistant`)
- [ ] **004** — Crater billing & invoices (`billing`)
- [ ] **005** — Website Audit (`site_audits`)
- [ ] **006** — Website change monitoring (`site_monitoring`)
- [ ] **007** — Uptime monitoring (`uptime_monitoring`)
- [ ] **008** — Document signing templates (`documents`)
- [ ] **009** — Telnyx voice agent (`voice`)
- [ ] **010** — Vapi assistant (`vapi`)
- [ ] **011** — CardDAV (iOS Contacts sync) (`carddav`)
- [ ] **012** — Cal.com scheduling (`scheduling`)
- [ ] **013** — Dev & infrastructure (`dev_infra`)
- [ ] **014** — Local code tools (`code_dev`)
- [ ] **015** — Newsletter & email automation (`email_marketing`)
- [ ] **016** — Fleet tracking (`fleet_tracking`)
- [ ] **017** — Dealership wizard (`dealership_wizard`)
- [ ] **018** — DNS record management (`namecom_dns`)
- [ ] **019** — Project time log (`time_tracking`)
- [ ] **020** — Demo mode (`demo`)
- [ ] **021** — Real estate data & lead scanner (`real_estate_data`)
- [ ] **022** — Multi-channel inventory sync (`inventory_sync`)
- [ ] **023** — Online reviews inbox (`online_reviews`)
- [ ] **024** — Wayback Machine (`wayback_machine`)
- [ ] **025** — Pexels stock photos (`stock_photos`)

## Step 1 — App core

- [ ] Railway Astro service + Postgres
- [ ] `DATABASE_URL`
- [ ] Clerk keys + allowed origins
- [ ] `INSTALL_CONFIG=demo`
- [ ] `CONTACT_API_BASE_URL` + `CONTACT_API_KEY`
- [ ] Resend inbound + `RESEND_*`
- [ ] `ANTHROPIC_API_KEY` + `AGENT_ALERT_USER_ID`

## Step 2 — Client baseline

- [ ] Company branding (Admin → Company)
- [ ] `VAPID_*` + `PUSH_ENABLED`
- [ ] `GOOGLE_MAPS_API_KEY` / Mapbox
- [ ] `DASHBOARD_KEY`
- [ ] Agent tools: `BRAVE_API_KEY`, `PEXELS_API_KEY`, `SIRI_API_KEY`

## Step 3 — Add-ons (selected)

### Crater billing & invoices (`billing`)

Status: **pending** · Playbook: `plugins/billing/DEPLOY.md`

# Billing (Crater) deployment

## Sibling services

- **Crater** — separate Railway service from `eliteweblabs/crater-invoicing`

## Required env vars

- `CRATER_API_BASE_URL` — public Crater host (e.g. `https://${{ crater.RAILWAY_PUBLIC_DOMAIN }}`)
- `CRATER_API_TOKEN` — must match Crater's `CRATER_API_TOKEN`

## External setup

- Deploy Crater + Postgres on Railway
- Enable `billing` in install config `features[]`
- Add `finance` to `footerNav` if not present

## Checklist

- [ ] Deploy Crater service + Postgres
- [ ] Set `CRATER_*` on Astro service
- [ ] Verify Finance tab loads in `/admin/`
- [ ] Test create invoice via agent or UI
- [ ] Set `moduleStatus.billing` → `deployed` in install config

### Website change monitoring (`site_monitoring`)

Status: **pending** · Playbook: `plugins/site-monitoring/DEPLOY.md`

# Website monitoring deployment

## Sibling services

- None — integrates with ChangeDetection.io (self-hosted or SaaS)

## Required env vars

- `CHANGEDETECTION_BASE_URL` — ChangeDetection.io instance URL
- `CHANGEDETECTION_API_KEY` — API key for watch management
- `CHANGEDETECTION_WEBHOOK_SECRET` — auth for inbound change webhooks

## External setup

- Enable `site_monitoring` in install config `features[]`
- Deploy or subscribe to ChangeDetection.io
- Point watch webhooks to Reave `/api/changedetection/webhook?key=`

## Checklist

- [ ] Set `CHANGEDETECTION_*` on Astro service
- [ ] Create a test watch and confirm webhook delivery
- [ ] Verify change alerts appear in admin
- [ ] Set `moduleStatus.site_monitoring` → `deployed` in install config

### Uptime monitoring (`uptime_monitoring`)

Status: **pending** · Playbook: `plugins/uptime-monitoring/DEPLOY.md`

# Uptime monitoring deployment

## Sibling services

- None — integrates with UptimeRobot API

## Required env vars

- `UPTIMEROBOT_API_KEY` — from UptimeRobot Integrations → API
- `UPTIMEROBOT_WEBHOOK_SECRET` — long random string for webhook auth
- `UPTIMEROBOT_POLL_SECRET` — optional; defaults to webhook secret for cron poll

## External setup

- Enable `uptime_monitoring` in install config `features[]`
- Create UptimeRobot webhook → `/api/uptime/webhook?key=<secret>`
- Disable UptimeRobot email alerts once webhooks are verified

## Checklist

- [ ] Set `UPTIMEROBOT_*` on Astro service
- [ ] Configure webhook integration in UptimeRobot
- [ ] Verify monitor status in admin dashboard
- [ ] Set `moduleStatus.uptime_monitoring` → `deployed` in install config

### Telnyx voice agent (`voice`)

Status: **pending** · Playbook: `config/modules/voice.DEPLOY.md`

# Telnyx voice agent deployment

## Sibling services

- None — Telnyx Call Control handles telephony

## Required env vars

- `TELNYX_API_KEY` — Telnyx portal API key
- `TELNYX_FROM_NUMBER` — inbound number in E.164 format
- `TELNYX_WEBHOOK_PUBLIC_KEY` — webhook signature validation
- `VOICE_AGENT_ENABLED=1` — enable AI phone agent on inbound calls
- `TELNYX_OPERATOR_NUMBER` — transfer target for `/takeover`
- `TELNYX_APP_ID` — Call Control Application ID

## External setup

- Enable `voice` in install config `features[]`
- Configure Telnyx Messaging/Voice profile webhooks → `/api/voice/webhook`
- Set `ANTHROPIC_API_KEY` for AI replies during calls

## Checklist

- [ ] Set `TELNYX_*` and `VOICE_AGENT_ENABLED=1`
- [ ] Point Telnyx webhooks at production URL
- [ ] Place a test inbound call and verify AI greeting
- [ ] Set `moduleStatus.voice` → `deployed` in install config

### Vapi assistant (`vapi`)

Status: **pending** · Playbook: `plugins/vapi/DEPLOY.md`

# Vapi assistant deployment

## Sibling services

- None — Vapi cloud hosts the assistant

## Required env vars

- `VAPI_API_KEY` — private key for build sync and admin API
- `PUBLIC_VAPI_PUBLIC_KEY` — client SDK key (browser-safe)
- `PUBLIC_VAPI_ASSISTANT_ID` — assistant UUID (or set in Admin → Vapi)

## External setup

- Enable `vapi` in install config `features[]`
- Add `"vapi"` to `profileMenu` for settings tab
- Set `"homepageVoice": true` only when the public widget is sold
- Create assistant in Vapi dashboard; allow production origin

## Checklist

- [ ] Set `VAPI_*` and `PUBLIC_VAPI_*` on Astro service
- [ ] Redeploy (prebuild runs `sync:vapi`)
- [ ] Verify Admin → Vapi settings and optional homepage widget
- [ ] Set `moduleStatus.vapi` → `deployed` in install config

### Cal.com scheduling (`scheduling`)

Status: **pending** · Playbook: `plugins/scheduling/DEPLOY.md`

# Scheduling (Cal.com) deployment

## Sibling services

- **calcom-booking-api** — booking REST API on Railway
- **calcom-web-app** — Cal.com web UI (`CALCOM_WEBAPP_URL`)

## Required env vars

- `BOOKING_API_URL` — private URL, e.g. `http://${{ calcom-booking-api.RAILWAY_PRIVATE_DOMAIN }}:8080`
- `PUBLIC_BOOKING_API_URL` — public URL for client embeds
- `CALCOM_WEBAPP_URL` — Cal.com host (e.g. `https://cal.reave.app`)
- `CALCOM_USERNAME` — Cal.com account username
- `BOOKING_API_KEY` — optional; when calcom-booking-api enforces auth

## External setup

- Deploy calcom-booking-api + calcom-web-app on Railway
- Enable `scheduling` in install config `features[]`
- Add `schedule` to `footerNav` if not present

## Checklist

- [ ] Deploy calcom-booking-api service
- [ ] Set `BOOKING_*` and `CALCOM_*` on Astro service
- [ ] Verify Schedule tab and agent booking tools
- [ ] Set `moduleStatus.scheduling` → `deployed` in install config

### Dev & infrastructure (`dev_infra`)

Status: **pending** · Playbook: `plugins/dev-infra/DEPLOY.md`

# Dev & infrastructure deployment

## Sibling services

- None — agent tools call GitHub, Railway, and Kinsta APIs directly

## Required env vars

- `GITHUB_TOKEN` — repo status, commits, PRs (read/write scopes as needed)
- `RAILWAY_API_TOKEN` — list domains, create projects
- `RAILWAY_WORKSPACE_ID` — optional; required if name-only create fails
- `RAILWAY_WEBHOOK_INGRESS_KEY` — deploy failure alerts to admin
- `KINSTA_API_KEY` — WordPress site management
- `KINSTA_COMPANY_ID` — MyKinsta company UUID

## External setup

- Enable `dev_infra` in install config `features[]`
- Create Railway account token and Kinsta API key
- Configure Railway project webhook → `/api/railway/webhook?key=`

## Checklist

- [ ] Set `GITHUB_TOKEN` and `RAILWAY_*` vars
- [ ] Set `KINSTA_*` if WordPress tools are needed
- [ ] Test `list_railway_domains` agent tool
- [ ] Set `moduleStatus.dev_infra` → `deployed` in install config

### Local code tools (`code_dev`)

Status: **pending** · Playbook: `plugins/code-dev/DEPLOY.md`

# Code dev tools deployment

## Sibling services

- None

## Required env vars

- None — local dev only; never enable on production client installs

## External setup

- Enable `code_dev` in install config `features[]` for web development agencies and similar installs
- Grants agent `read_file`, `write_file`, `list_files`, `exec_command` on the repo

## Checklist

- [ ] Add `code_dev` to install config `features[]`
- [ ] Verify agent can read/write files locally
- [ ] Set `moduleStatus.code_dev` → `deployed` in install config

### Newsletter & email automation (`email_marketing`)

Status: **pending** · Playbook: `plugins/email-marketing/DEPLOY.md`

# Email marketing deployment

## Sibling services

- None — uses Resend for outbound email

## Required env vars

- `RESEND_API_KEY` — outbound sends
- `RESEND_FROM` — verified sender address
- `NEWSLETTER_POLL_SECRET` — cron auth for `/api/newsletter/poll?key=`
- `NEWSLETTER_POLL_MINUTES` — optional; default 5
- `NEWSLETTER_SEND_WINDOW_START` / `NEWSLETTER_SEND_WINDOW_END` — optional send hours

## External setup

- Enable `email_marketing` in install config `features[]`
- Verify sending domain in Resend dashboard
- Schedule cron to hit `/api/newsletter/poll?key=<secret>`

## Checklist

- [ ] Set `RESEND_*` and `NEWSLETTER_*` on Astro service
- [ ] Verify Resend domain + webhook (if inbound triage needed)
- [ ] Trigger a test welcome or broadcast email
- [ ] Set `moduleStatus.email_marketing` → `deployed` in install config

### Fleet tracking (`fleet_tracking`)

Status: **pending** · Playbook: `plugins/fleet/DEPLOY.md`

# Fleet tracking deployment

## Sibling services

- **fleet-api** — Reave App Railway service (`fleet-api` + Postgres)

## Required env vars

- `FLEET_API_BASE_URL` — e.g. `https://${{ fleet-api.RAILWAY_PUBLIC_DOMAIN }}`
- `FLEET_API_KEY` — shared client key (or `${{ shared.FLEET_API_CLIENT_KEY }}`)

## External setup

- Deploy fleet-api from `bootstrap/fleet-api/` or `eliteweblabs/fleet-api`
- Enable `fleet_tracking` in install config `features[]`
- Assign vehicles to Clerk user ids in fleet-api

## Checklist

- [ ] Deploy fleet-api + Postgres on Railway
- [ ] Set `FLEET_*` on Astro service
- [ ] Verify GPS reporting from a signed-in device
- [ ] Set `moduleStatus.fleet_tracking` → `deployed` in install config

### Dealership wizard (`dealership_wizard`)

Status: **pending** · Playbook: `plugins/paulino-wizard/DEPLOY.md`

# Paulino wizard deployment

## Sibling services

- **paulino-wizard** — separate Railway project (`eliteweblabs/paulino-wizard`)

## Required env vars

- `PAULINO_WIZARD_API_BASE_URL` — e.g. `https://paulino-wizard-production.up.railway.app`
- `PAULINO_WIZARD_API_KEY` — optional; when the API enforces auth

## External setup

- Deploy paulino-wizard service (Paulino Auto Group project)
- Enable `dealership_wizard` in install config `features[]`
- Configure dealership inventory and deal workflows in paulino-wizard

## Checklist

- [ ] Deploy paulino-wizard API on Railway
- [ ] Set `PAULINO_WIZARD_API_*` on Astro service
- [ ] Test agent inventory/deal tools
- [ ] Set `moduleStatus.dealership_wizard` → `deployed` in install config

### DNS record management (`namecom_dns`)

Status: **pending** · Playbook: `plugins/namecom-dns/DEPLOY.md`

# Name.com DNS deployment

## Sibling services

- None

## Required env vars

- `NAMECOM_USERNAME` — Name.com account username
- `NAMECOM_TOKEN` — API token from Name.com account settings

## External setup

- Enable `namecom_dns` in install config `features[]` (agency/ops installs only)
- Generate API token at Name.com → Account → API Access
- Per-call vault credentials also supported as an alternative

## Checklist

- [ ] Confirm install is agency/ops (not a typical client deployment)
- [ ] Set `NAMECOM_*` on Astro service
- [ ] Test `list_dns_records` agent tool
- [ ] Set `moduleStatus.namecom_dns` → `deployed` in install config

### Real estate data & lead scanner (`real_estate_data`)

Status: **pending** · Playbook: `plugins/real-estate-data/DEPLOY.md`

# Real estate data deployment

## Sibling services

- None — property data from ATTOM or mock provider

## Required env vars

- `REAL_ESTATE_DATA_PROVIDER` — `attom` or `mock`
- `ATTOM_API_KEY` — required when provider is `attom`
- `LEAD_SCANNER_POLL_SECRET` — cron auth for `/api/lead-scanner/poll?key=`
- `LEAD_SCANNER_POLL_MINUTES` — optional; default 30

## External setup

- Enable `real_estate_data` in install config `features[]`
- Obtain ATTOM API key (or use `mock` for testing)
- Schedule daily lead scanner cron

## Checklist

- [ ] Set `REAL_ESTATE_DATA_PROVIDER` and `ATTOM_API_KEY`
- [ ] Set `LEAD_SCANNER_*` and configure geofence in admin
- [ ] Run a test property lookup via agent
- [ ] Set `moduleStatus.real_estate_data` → `deployed` in install config

### Multi-channel inventory sync (`inventory_sync`)

Status: **pending** · Playbook: `plugins/inventory/DEPLOY.md`

# Inventory sync deployment

## Sibling services

- **inventory-api** — Reave App Railway service (Shopify, WooCommerce, Square)

## Required env vars

- `INVENTORY_API_BASE_URL` — e.g. `https://${{ inventory-api.RAILWAY_PUBLIC_DOMAIN }}`
- `INVENTORY_API_KEY` — shared client key (or `${{ shared.INVENTORY_API_CLIENT_KEY }}`)

## External setup

- Deploy inventory-api from `bootstrap/inventory-api/`
- Enable `inventory_sync` in install config `features[]`
- Connect sales channels in inventory-api admin

## Checklist

- [ ] Deploy inventory-api on Railway
- [ ] Set `INVENTORY_*` on Astro service
- [ ] Test agent inventory list/sync tools
- [ ] Set `moduleStatus.inventory_sync` → `deployed` in install config

### Online reviews inbox (`online_reviews`)

Status: **pending** · Playbook: `plugins/online-reviews/DEPLOY.md`

# Online reviews deployment

## Sibling services

- None — Google Places API for review sync

## Required env vars

- `GOOGLE_MAPS_API_KEY` — Places API for Google review sync (alias: `GOOGLE_PLACES_API_KEY`)

## External setup

- Enable `online_reviews` in install config `features[]`
- Add `reviews` to `footerNav` if not present
- Configure Google Place ID in Reviews settings or Admin → Socials

## Checklist

- [ ] Set `GOOGLE_MAPS_API_KEY` on Astro service
- [ ] Configure Place ID and run `sync_google_reviews`
- [ ] Verify inbox to-do workflow in Reviews tab
- [ ] Set `moduleStatus.online_reviews` → `deployed` in install config


## Demo suite URL

```
/?demo=tier-1&modules=[001,004,006,009]&industry=plumbing
```

Sign in to admin and run demo seed (owner) or ask the agent to *run demo seed* with `fresh: true`.
