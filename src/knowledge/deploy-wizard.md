# Deploy wizard

Owner page: **`/deploy`**. Same module-toggle UI as `/demo-loader`, then a Railway variable plan that prefers **reference variables** over pasted URLs.

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

Add these on the install apex (`acme.com`). Prefixes do not change.

| Host | Type | When | Attach |
|------|------|------|--------|
| `@` / `www` | CNAME | Always | Railway `reave` |
| `inbound` | MX | Always (inbox) | Resend receiving — `inbox@inbound.{apex}` |
| `clerk` / `accounts` | CNAME | Always (Clerk) | Clerk → Domains |
| `ap` | CNAME | `billing` | Railway `crater` |
| `cal` | CNAME | `scheduling` | Railway `calcom-web-app` |
| `book` | CNAME | `scheduling` | Railway `calcom-booking-api` |
| `demo` | CNAME | `demo` | Railway `reave` (sandbox host) |
| `stats` | CNAME | Plausible extra | Railway `plausible` |
| `watch` | CNAME | ChangeDetection extra | Railway `changedetection` |

Each Railway CNAME also needs the `_railway-verify` TXT Railway shows until the domain verifies.

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
| `RESEND_FROM` → `EMAIL_FROM=${{ RESEND_FROM }}` | Cal.com `EMAIL_FROM=${{ reave.EMAIL_FROM }}` |
| `RESEND_API_KEY` | Cal.com `RESEND_API_KEY` + `EMAIL_SERVER_PASSWORD`; Crater `MAIL_PASSWORD` |
| `PUBLIC_SITE_URL` | `contact-api` / fleet / inventory / materials `ALLOWED_ORIGINS` |

Cal.com also gets Resend SMTP literals (`smtp.resend.com` / `465` / `resend`) so it never falls back to local `sendmail` when `EMAIL_FROM` is unset.

Prefer a **bare** verified address in `RESEND_FROM` (`noreply@mail.example.com`). Cal.com’s `EMAIL_FROM` is a From address, not a display-name header.

## What you still type

Third-party secrets only: Clerk, Anthropic, Resend, Telnyx, Vapi, Google, GitHub, and similar. Generated values (webhook secrets, CardDAV password, shared client keys, Cal.com `NEXTAUTH_SECRET`) can be rolled in the wizard.

## Apply

`POST /api/deploy/wizard` with `action: "apply"` writes the plan to a Railway project (`RAILWAY_API_TOKEN` on this host). Services must already exist with the names above. Redeploy after apply.

Catalog source: `src/lib/deployWizardCatalog.ts`.
