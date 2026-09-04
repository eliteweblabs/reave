# Railway deploy → admin repair chat (opt-in)

When Railway posts a **deployment failure** webhook to Reave:

1. **Deploy indicator** — red “failed” state (chat is **not** locked — previous deploy stays live)
2. **Nothing else by default** — no repair Session, no agent run, no token burn

## Auto-repair (opt-in)

Set **`DEPLOY_FAILURE_AUTO_REPAIR=1`** on the Reave App service to enable repair Sessions:

- One thread per service; later failures append to the same title (`Deploy failed — <service>`)
- Fetches Railway logs, posts the repair playbook, and auto-runs the agent

Leave it **unset** (default) if you only want the header deploy dot to turn red.

When **`RAILWAY_INCIDENT_HANDLER=1`** (also opt-in), the heavier loop can run **only if** `DEPLOY_FAILURE_AUTO_REPAIR=1`:

1. **Repo lock** — one active incident per GitHub repo (duplicate webhooks/emails suppressed)
2. **Agent playbook** — `read_knowledge slug "railway-build-failure-triage"`
3. **Verify loop** — re-checks deploy health ~90s after a fix commit
4. **Close** — `✅ RESOLVED` deletes inbox email; `🚨 UNRESOLVED` pushes to phone (email path only)

## Setup

1. **Astro env (Reave App service)**
   - `RAILWAY_WEBHOOK_INGRESS_KEY` — long random string; same value in the webhook URL `?key=`.
   - `AGENT_ALERT_USER_ID` — your Clerk user id (repair chats land under this user).
   - `RAILWAY_API_TOKEN` — needed only when auto-repair is on (log fetch into the chat).
   - `DEPLOY_FAILURE_AUTO_REPAIR=1` — optional; off by default.
   - `RAILWAY_INCIDENT_HANDLER=1` — optional repo lock + verify loop (requires auto-repair for agent runs).
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
- Opening a long repair Session in the browser only loads the **last 48 messages** — full history remains in Postgres for `get_chat`.
