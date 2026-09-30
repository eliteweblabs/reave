# Christian Gonzalez — Railway project

Solo barber stack: public site + slim reave hub (schedule + Crater) + Cal.com + contact-api.

| | |
|---|---|
| **Workspace** | re>\|<o studio (`c8d49e41-05f3-42ee-bf1d-3fc946a00a1a`) |
| **Project** | Christian Gonzalez (`74463066-704a-4656-8260-07d5fdba86c6`) |
| **Environment** | production (`e018980e-ed14-48e9-804f-61274420b60e`) |
| **Install slug** | `christian-gonzalez` |
| **Config** | `config/config-christian-gonzalez.json` |
| **Public site repo** | [eliteweblabs/christian-gonzalez-site](https://github.com/eliteweblabs/christian-gonzalez-site) |
| **Staging admin host** | `https://christian-gonzalez.reave.app` (wire DNS on reave.app zone when ready) |
| **Site Railway service** | `christian-gonzalez-site` |

## Live URLs (Railway defaults — custom domain TBD)

| Service | URL |
|---------|-----|
| Public site | https://christian-gonzalez-site-production.up.railway.app |
| Slim admin (`reave`) | https://reave-production-a663.up.railway.app |
| Cal.com UI | https://calcom-web-app-production-9f9d.up.railway.app |
| Crater | https://crater-production-4b92.up.railway.app |


| Service | Role |
|---------|------|
| `christian-gonzalez-site` | Marketing / book CTA (Astro) |
| `reave` | Slim admin + booking API client + Crater bridge |
| `reave-postgres` | App DB |
| `contact-api` + `contact-postgres` | Contacts (always on) |
| `calcom-booking-api` + `calcom-web-app` + `calcom-postgres` | Scheduling |
| `crater` + `crater-postgres` | Invoicing / pay links |

Module checklist: `docs/deploy-checklists/christian-gonzalez-scheduling-billing-content_management.md`

## Next (Apply from reave.app Deploy wizard or Railway vars)

1. Clerk app for `christian-gonzalez.reave.app` (+ `cal.christian-gonzalez.reave.app` when on custom apex).
2. `INSTALL_CONFIG=christian-gonzalez`, `FEATURES` = scheduling, billing, content_management.
3. Resend inbound + `RESEND_*` on `reave` (Cal.com email refs `${{ reave.RESEND_* }}`).
4. `BOOKING_API_URL`, `PUBLIC_BOOKING_API_URL`, `CALCOM_*`, `CRATER_*` reference vars per `plugins/scheduling/DEPLOY.md` and `plugins/billing/DEPLOY.md`.
5. Christian signs in once → set `AGENT_ALERT_USER_ID` to his Clerk user id.
6. Custom domain later: point apex at `christian-gonzalez-site`; admin at `app.{apex}` or keep staging.

## Troubleshooting — `contact-api` ETIMEDOUT to Postgres

**Symptom:** `Schema migration failed: connect ETIMEDOUT fd12:…:5432`

**Cause (this project):** Postgres services were provisioned **without volumes** first. Railway’s postgres image then wrote a broken data dir; after volumes were added, logs show `Skipping initialization` and `FATAL: role "postgres" does not exist`. `contact-api` keeps retrying the old private host.

**Fix:**

1. Open [Christian Gonzalez → production](https://railway.com/project/74463066-704a-4656-8260-07d5fdba86c6?environmentId=e018980e-ed14-48e9-804f-61274420b60e).
2. If the canvas shows **staged changes** (fresh `contact-postgres-volume` + new `POSTGRES_PASSWORD`), click **Review / Deploy** and confirm (2FA) — safe on this new install; no client data yet.
3. Wait for **contact-postgres** SUCCESS; logs should show fresh init (not “Skipping initialization” with role errors).
4. **contact-api** should already have `DATABASE_URL=${{ contact-postgres.DATABASE_URL }}`; redeploy it if still crashed.
5. Confirm all four Postgres services have a volume at `/var/lib/postgresql/data` and `PGDATA=/var/lib/postgresql/data/pgdata`.
