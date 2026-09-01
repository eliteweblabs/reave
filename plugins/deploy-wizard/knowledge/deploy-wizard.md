# Deploy wizard

Super-admin module on the official reave.app Railway install only (`visibility: private` — not a purchasable storefront add-on). Enable with `deploy_wizard` in `config/config-reave.json` `features[]` and `deploy` in `footerNav`. Page: **`/deploy`**. Client installs 404 the page and `/api/deploy/wizard`.

Same module-toggle UI as `/demo-loader`, then a Railway variable plan that prefers **reference variables** over pasted URLs. Tiles only switch on when the module is **deployed** and enabled on production Reave — requested or in-development cards stay visible but cannot be included.

## Why references

Railway resolves `${{ service.VAR }}` and `${{ shared.KEY }}` at deploy time. If every install uses the same service names, the templates never change — you do not re-type `CONTACT_API_BASE_URL` or copy API keys between siblings.

Official docs: [Reference variables](https://docs.railway.com/guides/variables#reference-variables).

## Canonical service names

Keep these exact names on new installs:

| Service | Role |
|---------|------|
| `reave` | Astro app (override in the wizard if needed) |
| `reave-postgres` | App database |
| `contact-api` | Contacts / portals |
| `contact-postgres` | contact-api database |
| `crater` / `crater-postgres` | Billing |
| `calcom-booking-api` / `calcom-web-app` / `calcom-postgres` | Scheduling |
| `fleet-api` / `fleet-postgres` | Fleet GPS |
| `inventory-api` | Inventory sync |
| `materials-api` | Materials pricing (`materials_pricing` module) |
| `paulino-wizard` | Dealership wizard |
| `changedetection` | Self-hosted ChangeDetection (optional extra) |
| `plausible` | Self-hosted Plausible (optional extra) |

## Canonical subdomains

Prefixes do not change. **Apply** attaches Railway custom domains and upserts Cloudflare (grey-cloud / DNS only) when `CLOUDFLARE_API_TOKEN` is set on this host. The zone must already live in the Cloudflare account.

| Host | Type | When | Apply does |
|------|------|------|--------|
| `@` / `www` | CNAME | Always | Railway `reave` + Cloudflare CNAME + `_railway-verify` TXT |
| `inbound` | MX | Always (inbox) | Create Resend domain `inbound.{apex}` and sync MX/TXT |
| `clerk` / `accounts` | CNAME | Always (Clerk) | **Manual** — copy from Clerk → Domains |
| `ap` | CNAME | `billing` | Railway `crater` + Cloudflare |
| `cal` | CNAME | `scheduling` | Railway `calcom-web-app` + Cloudflare |
| `book` | CNAME | `scheduling` | **Skipped** — Railway public domain is enough |
| `demo` | CNAME | `demo` | Railway `reave` + Cloudflare |
| `stats` | CNAME | Plausible extra | Railway `plausible` + Cloudflare |
| `watch` | CNAME | ChangeDetection extra | Railway `changedetection` + Cloudflare |

## Typical references on `reave`

```text
DATABASE_URL=${{ reave-postgres.DATABASE_URL }}
PUBLIC_SITE_URL=https://${{ reave.RAILWAY_PUBLIC_DOMAIN }}
CONTACT_API_BASE_URL=https://${{ contact-api.RAILWAY_PUBLIC_DOMAIN }}
CONTACT_API_KEY=${{ shared.CONTACT_API_CLIENT_KEY }}
CRATER_API_BASE_URL=https://${{ crater.RAILWAY_PUBLIC_DOMAIN }}
CRATER_API_TOKEN=${{ shared.CRATER_API_TOKEN }}
BOOKING_API_URL=http://${{ calcom-booking-api.RAILWAY_PRIVATE_DOMAIN }}:8080
FLEET_API_BASE_URL=https://${{ fleet-api.RAILWAY_PUBLIC_DOMAIN }}
FLEET_API_KEY=${{ shared.FLEET_API_CLIENT_KEY }}
```

On each sibling API: `API_KEY=${{ shared.*_CLIENT_KEY }}` and `DATABASE_URL=${{ <name>-postgres.DATABASE_URL }}`. CORS is `${{ reave.PUBLIC_SITE_URL }}`.

## Source of truth is `reave`

Put third-party secrets on the Astro service once. Siblings **reference** them — do not paste the same key again.

| On `reave` | Sibling reads |
|------------|----------------|
| `RESEND_FROM` → `EMAIL_FROM=${{RESEND_FROM}}` | Cal.com `EMAIL_FROM=${{ reave.EMAIL_FROM }}` and `NEXT_PUBLIC_SUPPORT_MAIL_ADDRESS` |
| `EMAIL_FROM_NAME` | Cal.com `EMAIL_FROM_NAME` / `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_COMPANY_NAME`; Crater `MAIL_FROM_NAME` |
| `CALCOM_USERNAME` | Filled from the install slug on `reave`. `calcom-booking-api` must reference `${{ reave.CALCOM_USERNAME }}` or list/create returns "User not found". Do not re-type on calcom-web-app. |
| `COMPANY_ICON_URL` | `${{PUBLIC_SITE_URL}}/api/branding/icon?size=192` — Cal.com avatar pickup and any sibling that needs the mark |
| `COMPANY_LOGO_URL` | `${{PUBLIC_SITE_URL}}/branding/logo.png` — Crater invoice email header (PNG wordmark) |
| `RESEND_API_KEY` | Cal.com `RESEND_API_KEY` + `EMAIL_SERVER_PASSWORD`; Crater `MAIL_PASSWORD` |
| `PUBLIC_SITE_URL` | `contact-api` / fleet / inventory / materials `ALLOWED_ORIGINS` |

Cal.com’s owner (avatar, username, email) is a `users` row, not an env var. After apply — or when `calcom-web-app` shows up later — the reave.app node **creates** that row when the Cal.com database is empty (plus 15/30/60 event types and weekday hours), then keeps username / email / icon in sync from company config / `GET /api/install/identity`. Public signup stays off (`NEXT_PUBLIC_DISABLE_SIGNUP=true`). Do not ask the owner to finish Cal.com onboarding.

Cal.com also gets Resend SMTP literals (`smtp.resend.com` / `465` / `resend`) so it never falls back to local `sendmail` when `EMAIL_FROM` is unset.

Prefer a **bare** verified address in `RESEND_FROM` (`noreply@inbound.example.com`). Cal.com’s `EMAIL_FROM` is a From address, not a display-name header. The apex is a Railway CNAME, so sending uses the inbound subdomain Apply provisions.

## Identity fields

The first step writes these onto `reave` (same keys live client installs already have on Railway):

| Field | Variable | Default |
|-------|----------|---------|
| Install slug | `INSTALL_CONFIG` / `CALCOM_USERNAME` | `demo` |
| Site domain | `PUBLIC_SITE_DOMAIN` / `COMPANY_DOMAIN` | (empty) |
| Post name | `POST_ALIAS` | `project` |
| Company name | `COMPANY_NAME` (also prefills `EMAIL_FROM_NAME`) | (empty) |
| Admin username | `ADMIN_USERNAME` | owner name/email, then company name |
| First name | `OWNER_FIRST_NAME` | (empty, optional) |
| Last name | `OWNER_LAST_NAME` | (empty, optional) |
| Email | `OWNER_EMAIL` | (empty, optional — also fills `VAPID_SUBJECT`) |
| Phone | `OWNER_PHONE` | (empty, optional, stored E.164) |
| Timezone | `BOOKING_TIMEZONE` | `America/New_York` |

Owner name, email, phone, and timezone are the same fields as Admin → Profile. They are optional. On the first owner visit to `/admin`, empty Clerk Profile fields are filled from these values. `OWNER_EMAIL` also becomes the Web Push `mailto:` and is added to owner-match names so the first sign-in can match before `AGENT_ALERT_USER_ID` is set.

## Staging on `{slug}.reave.app`

There is **no REΛVE.app dropdown**. On the first wizard step, enter the client apex and choose **Registrar access**:

| Choice | Apply behavior |
|--------|----------------|
| **Not yet** (default) | Stages on `{slug}.reave.app` when the apex is empty or not in Cloudflare |
| **Name.com** + API creds | One-shot: create Cloudflare zone, update Name.com nameservers, wire full apex DNS |
| **Already in Cloudflare** | Wire the apex when the zone exists in this account |

When staging applies:

- `PUBLIC_SITE_URL`, `PUBLIC_SITE_DOMAIN`, and `COMPANY_DOMAIN` point at the staging host (not the raw `*.up.railway.app` URL).
- `PLANNED_SITE_DOMAIN` keeps the client apex for cutover.
- `RESEND_FROM` / `EMAIL_FROM` use `noreply@inbound.reave.app` until go-live.
- DNS Apply only wires the `@` app host on reave.app — skip `ap` / `cal` / `inbound` until the client zone exists.

When the apex is already in Cloudflare, behavior is unchanged (full DNS on Apply).

## Go live (`/go-live`)

After staging, open **`/go-live`** (owner-only, same host as the deploy wizard). Pick the Railway project, enter the client apex, and choose:

| Registrar | What happens |
|-----------|----------------|
| **Name.com** | Paste API username + token — nameservers update automatically |
| **GoDaddy / manual** | Apply creates the Cloudflare zone and shows nameservers to paste at the registrar |

Go live then: creates/finds the Cloudflare zone, attaches Railway custom domains, writes full DNS (inbound MX, `ap`, `cal`, …), and flips `PUBLIC_SITE_URL` to `https://{apex}`. Add the apex in Clerk → Domains when DNS resolves.

## Apply fills every value

This wizard is owner-only. The Variables step is read-only. Apply:

- **Copies** third-party keys from this host (Clerk, Anthropic, Resend API key, Telnyx, Vapi, Google, GitHub, Railway, …). Values never go to the browser.
- **Rolls** new secrets on the server (shared API keys, CardDAV password, Cal.com `NEXTAUTH_SECRET` / `CALENDSO_ENCRYPTION_KEY`, dashboard key, cron secrets) and a real Web Push VAPID pair.
- **Creates** a Resend `email.received` webhook at `https://{apex}/api/email/inbound` and writes the signing secret as `RESEND_WEBHOOK_SECRET`.
- **Derives** `RESEND_FROM` as `noreply@inbound.{apex}` (the inbound domain Apply already adds in Resend) and `EMAIL_FROM_NAME` from the company name.
- **Website editor:** GitHub cannot create PATs via API. Apply creates `eliteweblabs/{slug}-site`, then POSTs the App manifest to GitHub (`/organizations/eliteweblabs/settings/apps/new`). CSP `form-action` must include `https://github.com` or the browser blocks that step. After you install the App on `{slug}-site` (not `eliteweblabs/reave`), Apply writes `GITHUB_APP_*` + `GITHUB_WEBSITE_REPO` onto the client. The client mints a Contents token scoped to that repo on each write. Host `GITHUB_TOKEN` must be a classic PAT with `repo` scope so Apply can create the repo and attach it. If this host already has `GITHUB_APP_*`, Apply reuses them instead of opening GitHub. The Review step streams a live Apply log (Railway project, each service, repo, then the GitHub handoff).

Apply copies **Resend** from this host and creates the inbound domain plus `email.received` webhook. Anthropic is optional (blank uses the reave.app host key). **Clerk keys are not copied** — each install needs its own Clerk application; paste `PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` on the client Railway service after creating the app (see `plugins/clerk-auth/knowledge/installs/client/clerk-auth.md`). Other host keys are copied when present and skipped when missing.

**Sample data / playbooks:** Admin → Industries is the deploy recipe list (`GET`/`PUT /api/admin/deck-industries`). Opening that page backfills **Law firm**, **Plumbing**, and **General contractor** with the recipes the wizard already used (sample inbox/todos/schedule; law uses work name `matter` and court-knowledge notes). A leftover “Plumbers” row is renamed to Plumbing when that slug is free. The Modules step picker loads that catalog and applies the playbook. Disabled rows stay hidden. Apply writes `SEED_ON_BOOT` + `DEMO_INDUSTRY`. The first owner visit to `/admin` seeds inbox, todos, and schedule so the dashboard is not empty before live email is connected. When `RESEND_API_KEY` is later set for the first time (it was blank/null), seeded inbox rows are wiped so they do not mix with live mail — rotating an existing key does not wipe. Law firm still adds court-knowledge options.

If a required operator key is missing, Apply names it and stops. Clerk CNAMEs are still copied from Clerk → Domains.

## Apply

`POST /api/deploy/wizard` with `action: "apply"` creates the Railway project when the wizard sends `project: "__new__"` (name from `projectName`, company name, or install slug — reused if that name already exists), then creates any missing canonical services:

- GitHub-backed services (`reave`, `contact-api`, …) connect `eliteweblabs/*` when the host token’s GitHub App can see those repos. If the repo attach fails, Apply still creates an empty service so variables have a target.
- Postgres services use Railway’s `postgres-ssl` image plus a volume at `/var/lib/postgresql/data`, and set `DATABASE_URL` for `${{ <name>.DATABASE_URL }}` refs.
- Cal.com / extras without a catalog repo are created as empty named services.

Then Apply writes the variable plan (`RAILWAY_API_TOKEN` on this host) and, when `CLOUDFLARE_API_TOKEN` is set, attaches Railway custom hosts and upserts DNS. Redeploy after apply. Clerk `clerk.` / `accounts.` CNAMEs are optional: production installs proxy Frontend API at `/__clerk` so WordPress/Kinsta zones do not need to serve those hosts.
