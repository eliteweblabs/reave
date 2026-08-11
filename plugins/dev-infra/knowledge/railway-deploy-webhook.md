# Railway deploy → admin repair chat (automatic)

When Railway posts a **deployment failure** webhook to Reave:

1. **Deploy indicator** — red “failed” state (chat is **not** locked — previous deploy stays live)
2. **New repair chat** — opens with the failure summary + Railway build/deploy logs
3. **Auto-fix** — agent runs immediately (“go fix it”; usually typo / lockfile / collision). No phone push.

When **`RAILWAY_INCIDENT_HANDLER=1`**, the heavier loop also runs:

1. **Repo lock** — one active incident per GitHub repo (duplicate webhooks/emails suppressed)
2. **Agent playbook** — `read_knowledge slug "railway-build-failure-triage"`
3. **Verify loop** — re-checks deploy health ~90s after a fix commit
4. **Close** — `✅ RESOLVED` deletes inbox email; `🚨 UNRESOLVED` pushes to phone (email path only)

`RAILWAY_INCIDENT_HANDLER` is optional. Repair chat + auto-fix always run when `AGENT_ALERT_USER_ID` is set.

## Setup

1. **Astro env (Reave App service)**
   - `RAILWAY_WEBHOOK_INGRESS_KEY` — long random string; same value in the webhook URL `?key=`.
   - `AGENT_ALERT_USER_ID` — your Clerk user id (repair chats land under this user).
   - `RAILWAY_API_TOKEN` — so the webhook path can dump build/deploy logs into the chat.
   - `RAILWAY_INCIDENT_HANDLER=1` — optional repo lock + verify loop.
   - `DATABASE_URL` — required for deploy-incident dedup when the incident handler is on.

2. **Railway project webhook** (configure on **each** Railway project that should drive the header deploy bulb)
   - URL: `https://reave.app/api/railway/webhook?key=<RAILWAY_WEBHOOK_INGRESS_KEY>` (or that install’s public origin, e.g. `https://demo.reave.app/api/railway/webhook?key=…`)
   - Set the same `RAILWAY_WEBHOOK_INGRESS_KEY` on **that** service (Demo was missing it historically — without the key, start/fail webhooks cannot update the bulb).
   - Subscribe to **Building** and **Deploying** (instant header deploy dot) plus **Success** / failure / crash events for the services you care about.
   - The bulb is Railway-only (no GitHub). When `RAILWAY_API_TOKEN` is set it can also poll GraphQL as a fallback; webhooks are still the fast path.

3. **Optional:** Railway failure emails → Resend inbound still works via `RAILWAY_ALERT` rule, but duplicates are auto-suppressed when the repo lock is held.

## Notes

- Success webhooks start the site-monitoring suppress window (when `site_monitoring` feature is enabled).
- Failed deploys do **not** pause the composer — only in-flight deploys do.
- Stale incidents (>45 min) auto-expire so a new alert can acquire the repo lock.
- Email path: see `src/knowledge/email-rules.md` for Resend inbound setup.
