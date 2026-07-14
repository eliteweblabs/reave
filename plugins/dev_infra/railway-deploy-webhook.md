# Railway deploy → admin alerts (automatic)

When Railway posts a **deployment failure** (or crash-style) webhook to Reave, Astro posts to the admin **System alerts** chat (and Web Push when configured).

## Setup

1. **Astro env (Reave App service)**
   - `RAILWAY_WEBHOOK_INGRESS_KEY` — long random string; same value in the webhook URL `?key=`.
   - `AGENT_ALERT_USER_ID` — your Clerk user id (creates/uses the "System alerts" chat thread).

2. **Railway project webhook**
   - URL: `https://reave.app/api/railway/webhook?key=<RAILWAY_WEBHOOK_INGRESS_KEY>`
   - Subscribe to deploy failure / crash events for the services you care about.

3. **Optional:** install `/admin` as a PWA and enable push (🛎) so deploy failures ping your phone even when Chats is closed.

## Notes

- Success webhooks start the site-monitoring suppress window (when `site_monitoring` feature is enabled).
- Email path for Railway crash notifications still works via Resend inbound + `RAILWAY_ALERT` rules — see repo playbook `email-rules.md`.
