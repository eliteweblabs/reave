# Deploy checklist — christian-gonzalez

Generated: 2026-09-30T14:31:56.700Z

> **Railway:** [christian-gonzalez-railway.md](./christian-gonzalez-railway.md) — project `74463066-704a-4656-8260-07d5fdba86c6` in re>\|<o studio.

> Contacts, email inbox, work/jobs, knowledge, personal to-dos, chat, passkeys, and phone sign-in are always on.

## Module picker (numeric ids for demo URLs)

- [ ] **004** — Client Portal (/c/:uid) (`client_portal`)
- [ ] **012** — Portal Data Tab (Handoff Creds) (`web_handoff`)
- [ ] **002** — Client Portal Help Chat (`portal_assistant`)
- [ ] **108** — Crater Financial (`billing`)
- [ ] **401** — Website Audit (`site_audits`)
- [ ] **405** — Website Change Monitoring (`site_monitoring`)
- [ ] **605** — Sites (Uptime) (`uptime_monitoring`)
- [ ] **404** — Sites (`analytic_audit`)
- [ ] **103** — Dynamic Documents (`documents`)
- [ ] **107** — Digital Signature (`digital_signature`)
- [ ] **508** — Telnyx Voice Agent (`voice`)
- [ ] **507** — VAPI Assistant (`vapi`)
- [ ] **503** — CardDAV (iOS Contacts Sync) (`carddav`)
- [ ] **109** — Cal.com Scheduling (`scheduling`)
- [ ] **602** — Dev & Infrastructure (`dev_infra`)
- [ ] **603** — Local Code Tools (`code_dev`)
- [ ] **106** — Newsletter & Email Automation (`email_marketing`)
- [ ] **504** — Fleet Tracking (`fleet_tracking`)
- [ ] **302** — Dealership Wizard (`dealership_wizard`)
- [ ] **606** — DNS Record Management (`namecom_dns`)
- [ ] **101** — Project Time Log (`time_tracking`)
- [ ] **601** — Demo Mode (`demo`)
- [ ] **505** — Real Estate Data & Lead Scanner (`real_estate_data`)
- [ ] **303** — Multi-Channel Inventory Sync (`inventory_sync`)
- [ ] **202** — Reviews Triage (`online_reviews`)
- [ ] **402** — Wayback Machine (`wayback_machine`)
- [ ] **** — Agentic Website Editor (`content_management`)
- [ ] **502** — Pexels Stock Photos (`stock_photos`)
- [ ] **403** — WordPress™ Connect (`wordpress_content`)
- [ ] **407** — SEO Directory API Kit (`seo_directory`)
- [ ] **406** — Agentic Website Editor (Client Web Tools) (`website`)
- [ ] **301** — Credit Check (Reference) (`credit_check`)

## Step 1 — App core

- [ ] Railway Astro service + Postgres
- [ ] `DATABASE_URL`
- [ ] Clerk keys + allowed origins
- [ ] `INSTALL_CONFIG=christian-gonzalez`
- [ ] `CONTACT_API_BASE_URL` + `CONTACT_API_KEY`
- [ ] Resend inbound + `RESEND_*`
- [ ] `ANTHROPIC_API_KEY` (blank copies the reave.app host key) + `AGENT_ALERT_USER_ID`

## Step 2 — Client baseline

- [ ] Company branding (Admin → Company)
- [ ] `VAPID_*` + `PUSH_ENABLED`
- [ ] `GOOGLE_MAPS_API_KEY` / Mapbox
- [ ] `DASHBOARD_KEY`
- [ ] Agent tools: `BRAVE_API_KEY`, `PEXELS_API_KEY`, `SIRI_API_KEY`

## Step 3 — Add-ons (selected)

### Crater Financial (`billing`)

Status: **development** · Playbook: `plugins/billing/DEPLOY.md`

# Billing (Crater) deployment

## Sibling services

- **Crater** — separate Railway service from `eliteweblabs/crater`

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

### Cal.com Scheduling (`scheduling`)

Status: **development** · Playbook: `plugins/scheduling/DEPLOY.md`

# Scheduling (Cal.com) deployment

## Sibling services

- **calcom-booking-api** — booking REST API on Railway
- **calcom-web-app** — Cal.com web UI (`CALCOM_WEBAPP_URL`)

## Required env vars

- `BOOKING_API_URL` — private URL, e.g. `http://${{ calcom-booking-api.RAILWAY_PRIVATE_DOMAIN }}:8080`
- `PUBLIC_BOOKING_API_URL` — public URL for client embeds
- `CALCOM_WEBAPP_URL` — Cal.com host (e.g. `https://cal.reave.app`)
- `CALCOM_USERNAME` — filled from the install slug (company / domain). Set on **reave** and referenced on **calcom-booking-api** (`${{ reave.CALCOM_USERNAME }}`). Without it on the booking API, Schedule shows "User not found". The reave.app node creates the Cal.com owner + 15/30/60 event types when the database is empty (signup stays off).
- `BOOKING_API_KEY` — optional; when calcom-booking-api enforces auth
- `CALENDAR_REMINDER_POLL_SECRET` — cron auth for `/api/calendar/reminders/poll?key=`
- `CALENDAR_REMINDER_POLL_MINUTES` — optional; default 1
- `CALENDAR_REMINDER_MINUTES` — optional comma-separated offsets; seeds Admin → Settings until saved (default `15`)

## External setup

- Deploy calcom-booking-api + calcom-web-app on Railway
- On **calcom-web-app**, do not type mail or profile secrets — reference `reave`:
  - `EMAIL_FROM=${{ reave.EMAIL_FROM }}` (alias of `RESEND_FROM` — required or Cal.com uses sendmail)
  - `EMAIL_FROM_NAME=${{ reave.EMAIL_FROM_NAME }}`
  - `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_COMPANY_NAME` = `${{ reave.EMAIL_FROM_NAME }}`
  - `NEXT_PUBLIC_SUPPORT_MAIL_ADDRESS=${{ reave.EMAIL_FROM }}`
  - `RESEND_API_KEY=${{ reave.RESEND_API_KEY }}`
  - `EMAIL_SERVER_PASSWORD` — Railway reference to `reave.RESEND_API_KEY` (host `smtp.resend.com` / port `465` / user `resend`)
- On **reave**, `CALCOM_DATABASE_URL=${{ calcom-postgres.DATABASE_URL }}` so a later Cal.com deploy still gets icon / username / email / bio from company settings (`GET /api/install/identity`) and can insert the owner user
- On **calcom-web-app**, do not edit profile fields in Cal.com admin — name, icon, email, tagline, and hours are managed in reave.app → Company and sync automatically
- On **calcom-booking-api**, `CALCOM_USERNAME=${{ reave.CALCOM_USERNAME }}` and `MAPBOX_ACCESS_TOKEN=${{ reave.PUBLIC_MAPBOX_ACCESS_TOKEN }}`
- Enable `scheduling` in install config `features[]`
- Add `schedule` to `footerNav` if not present
- Schedule cron to hit `/api/calendar/reminders/poll?key=<secret>` (in-process timer is a fallback)

## Checklist

- [ ] Deploy calcom-booking-api service
- [ ] Set `BOOKING_*` and `CALCOM_*` on Astro service
- [ ] Set `CALENDAR_REMINDER_POLL_SECRET` and schedule the poll cron
- [ ] Verify Schedule tab and agent booking tools
- [ ] Confirm a test booking fires a push + dashboard reminder ~15 minutes before start
- [ ] Set `moduleStatus.scheduling` → `deployed` in install config

### Agentic Website Editor (`content_management`)

Status: **development** · Playbook: `n/a`

_No DEPLOY.md for content_management_


## Demo suite URL

```
/?demo=tier-1&modules=[001,004,006,009]&industry=plumbing
```

Sign in to admin and run demo seed (owner) or ask the agent to *run demo seed* with `fresh: true`.
