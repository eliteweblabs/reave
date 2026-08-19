# Deploy wizard

Super-admin module on the official REΛVE Railway install only (`visibility: private` — not a purchasable storefront add-on). Enable with `deploy_wizard` in `config/config-reave.json` `features[]` and `deploy` in `footerNav`. Page: **`/deploy`**. Client installs 404 the page and `/api/deploy/wizard`.

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
| `materials-api` | Materials pricing (optional extra) |
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
| `CALCOM_USERNAME` | Filled from the install slug. Booking links and the Cal.com user use this — do not re-type on calcom-web-app. |
| `COMPANY_ICON_URL` | `${{PUBLIC_SITE_URL}}/api/branding/icon?size=192` — Cal.com avatar pickup and any sibling that needs the mark |
| `RESEND_API_KEY` | Cal.com `RESEND_API_KEY` + `EMAIL_SERVER_PASSWORD`; Crater `MAIL_PASSWORD` |
| `PUBLIC_SITE_URL` | `contact-api` / fleet / inventory / materials `ALLOWED_ORIGINS` |

Cal.com’s onboarding form (avatar, username, email) is a user row, not an env var. After apply — or when `calcom-web-app` shows up later — the REΛVE node writes those fields from company config / `GET /api/install/identity`. Refresh the Cal.com onboarding page if it was already open.

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
| Admin username | `ADMIN_USERNAME` | falls back to company name |
| Timezone | `BOOKING_TIMEZONE` | `America/New_York` |

## Apply fills every value

This wizard is owner-only. The Variables step is read-only. Apply:

- **Copies** third-party keys from this host (Clerk, Anthropic, Resend API key, Telnyx, Vapi, Google, GitHub, Railway, …). Values never go to the browser.
- **Rolls** new secrets on the server (shared API keys, CardDAV password, Cal.com `NEXTAUTH_SECRET` / `CALENDAR_ENCRYPTION_KEY`, dashboard key, cron secrets) and a real Web Push VAPID pair.
- **Creates** a Resend `email.received` webhook at `https://{apex}/api/email/inbound` and writes the signing secret as `RESEND_WEBHOOK_SECRET`.
- **Derives** `RESEND_FROM` as `noreply@inbound.{apex}` (the inbound domain Apply already adds in Resend) and `EMAIL_FROM_NAME` from the company name.
- **Website editor:** GitHub cannot create PATs via API. Apply creates `eliteweblabs/{slug}-site`, then sends you to GitHub to create a restricted App for that repo only (Contents write). After you install it on `{slug}-site` (not `eliteweblabs/reave`), Apply writes `GITHUB_APP_*` + `GITHUB_WEBSITE_REPO` onto the client. The client mints a Contents token scoped to that repo on each write. Host `GITHUB_TOKEN` must be a classic PAT with `repo` scope so Apply can create the repo and attach it. If this host already has `GITHUB_APP_*`, Apply reuses them instead of opening GitHub.

If a required host key is missing, Apply names it and stops. Clerk CNAMEs are still copied from Clerk → Domains.

## Apply

`POST /api/deploy/wizard` with `action: "apply"` writes the plan to a Railway project (`RAILWAY_API_TOKEN` on this host) and, when `CLOUDFLARE_API_TOKEN` is set, attaches Railway custom hosts and upserts DNS. Services must already exist with the names above. Redeploy after apply. Clerk CNAMEs are the only DNS leftover.

Catalog source: `src/lib/deployWizardCatalog.ts`.
