# Railway deploy → Telegram (automatic)

## What it does

When Railway posts a **deployment failure** (or crash-style) webhook to Reave, the **reave** app sends a short message to Telegram so you see it on your phone.

## Setup

1. **reave env** (Reave App → **reave** service):
   - `RAILWAY_WEBHOOK_INGRESS_KEY` — long random secret (generate locally).
   - `TELEGRAM_BOT_TOKEN` — same bot you use for the OS bot is fine.
   - `TELEGRAM_DEPLOY_NOTIFY_CHAT_ID` — numeric chat id (your user id for DMs, or a group id).

2. **Railway project** (Reave App → **Settings → Webhooks**):
   - URL: `https://reave.app/api/railway/webhook?key=<RAILWAY_WEBHOOK_INGRESS_KEY>`
   - Enable events that include **deployment failures** (wording in UI may vary; see [Railway webhooks](https://docs.railway.com/observability/webhooks)).

3. **GET** the same URL (with `?key=`) returns JSON `ok` — use to verify the secret before saving the webhook.

## Caveat

If a deploy fails so badly that **reave never starts**, the webhook cannot reach it. Keep Railway’s own UI/email habits too; this path covers “service still up, new revision failed” cases well.
