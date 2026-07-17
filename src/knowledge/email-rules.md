# Email inbox (Reave)

Smart inbox inside **/admin → Email tab**. You read **summaries** here — not Proton/Gmail.

## Flow

```
Proton/Gmail (human mail) ──BCC/forward copy──► inbox@inbound.reave.app (Resend MX)
       │
       ▼
POST /api/email/inbound → Claude triage → contact-api → job append → Postgres
       │
       ▼
/admin Email tab (+ Web Push to phone PWA)
```

- **Ingest:** Resend webhook at `/api/email/inbound` (copy mail here; keep reading in Proton).
- **Cutoff:** Mail whose `Date` header is before go-live is dropped (not triaged, not stored). Cutoff auto-sets to the first webhook time; override with `EMAIL_INBOUND_SINCE`.
- **Triage:** Keyword rules first (junk/marketing), then Claude (`EMAIL_AI_ENABLED`, needs `ANTHROPIC_API_KEY`).
- **Routing:** Resolve sender via contact-api → match open job → append note to job body (`storeAppendWorkNote`).
- **UI:** Summaries in admin Email tab; junk hidden by default (`?junk=1` to show).
- **Push:** Install `/admin` to home screen → tap 🔔 → Web Push (`VAPID_*` env vars).
- **Railway crash emails:** Rule `RAILWAY_ALERT` matches `noreply@railway.app` / “Deployment crashed” / “Build failed”. Posts to admin **System alerts** chat and auto-runs the agent when `AGENT_ALERT_USER_ID` is set (Clerk user id). Note: Railway often sends “Deployment crashed” during rollout while the new build is still starting — false alarm; the agent is prompted to verify in Railway first.
- **Railway webhooks:** Direct deploy-failure webhooks → `/api/railway/webhook` → admin System alerts chat (see `RAILWAY_WEBHOOK_INGRESS_KEY` + `AGENT_ALERT_USER_ID`). Email path covers notification emails that hit Proton.

## Categories

| category | meaning |
|----------|---------|
| `junk` | Marketing/newsletter — hidden from default inbox |
| `client` | Client/project mail — may auto-file to job |
| `alert` | Uptime, security, monitoring |
| `internal` | Admin/personal, not client work |
| `review` | Needs your decision |

## Environment

| var | purpose |
|-----|---------|
| `RESEND_API_KEY` / `RESEND_WEBHOOK_SECRET` | Resend receiving + webhook verify |
| `ANTHROPIC_API_KEY` | Summarize + classify + pick job |
| `EMAIL_AI_ENABLED` | Set `0` to disable AI (rules-only) |
| `EMAIL_INBOUND_SINCE` | Optional ISO date — ignore mail sent before this (overrides DB cutoff) |
| `EMAIL_INBOUND_FILTER` | Set `0` to disable the send-date cutoff (process all forwarded mail) |
| `CONTACT_API_BASE_URL` | Resolve sender → client |
| `DATABASE_URL` | Inbox log + jobs + push subscriptions |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push (generate: `npx web-push generate-vapid-keys`) |
| `VAPID_SUBJECT` | e.g. `mailto:thomas@reave.app` |
| `PUSH_ENABLED` | Set `0` to disable push |
| `AGENT_ALERT_USER_ID` | Clerk user id — alert emails → **System alerts** chat + agent |
| `AGENT_ALERT_AUTO_RUN` | Set `0` to queue alert without auto agent reply |

## Setup (one-time)

1. **Resend:** Enable receiving on `inbound.reave.app` (MX). Webhook `email.received` → `https://reave.app/api/email/inbound`.
2. **Copy mail in:** Proton filter or Gmail forward **BCC** to `inbox@inbound.reave.app` (or your Resend receiving address).
3. **Railway env:** `RESEND_*`, `ANTHROPIC_API_KEY`, `DATABASE_URL`, `CONTACT_API_BASE_URL`, `VAPID_*`.
4. **Phone:** Open `/admin?tab=email` → Add to Home Screen → tap 🔔.

## Security

Inbound email is classified by rules + Claude for **summarization and routing only**. Job append uses structured JSON from the model; untrusted HTML is not executed. Use `EMAIL_ALLOWED_*` to restrict senders if needed.
