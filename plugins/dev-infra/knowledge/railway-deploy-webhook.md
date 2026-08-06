# Railway deploy → admin alerts (automatic)

When Railway posts a **deployment failure** webhook to Reave **and** `RAILWAY_INCIDENT_HANDLER=1`, the **deploy-incident handler** runs:

1. **Repo lock** — one active incident per GitHub repo (duplicate webhooks/emails suppressed)
2. **Agent playbook** — `read_knowledge slug "railway-build-failure-triage"`
3. **Auto-fix** — `write_github_file` to `main` when the agent can identify the error
4. **Verify loop** — re-checks deploy health ~90s after a fix commit
5. **Close** — `✅ RESOLVED` deletes inbox email; `🚨 UNRESOLVED` pushes to phone (email path only)

**Default: off.** Leave `RAILWAY_INCIDENT_HANDLER` unset (or `0`) during development — failures are logged / appear in Email and System alerts without auto-investigation or Claude usage.

## Setup

1. **Astro env (Reave App service)**
   - `RAILWAY_WEBHOOK_INGRESS_KEY` — long random string; same value in the webhook URL `?key=`.
   - `RAILWAY_INCIDENT_HANDLER=1` — enable the auto-investigation loop (optional; off by default).
   - `AGENT_ALERT_USER_ID` — your Clerk user id (creates/uses the "System alerts" chat thread).
   - `DATABASE_URL` — required for deploy-incident dedup (Postgres).

2. **Railway project webhook** (configure on **each** Railway project)
   - URL: `https://reave.app/api/railway/webhook?key=<RAILWAY_WEBHOOK_INGRESS_KEY>`
   - Subscribe to **Building** and **Deploying** (instant header deploy dot) plus failure / crash events for the services you care about.

3. **Optional:** Railway failure emails → Resend inbound still works via `RAILWAY_ALERT` rule, but duplicates are auto-suppressed when the repo lock is held.

## Notes

- Success webhooks start the site-monitoring suppress window (when `site_monitoring` feature is enabled).
- Webhook path: silent investigation in System alerts — no phone push unless UNRESOLVED (email path).
- Stale incidents (>45 min) auto-expire so a new alert can acquire the repo lock.
- Email path: see `src/knowledge/email-rules.md` for Resend inbound setup.
