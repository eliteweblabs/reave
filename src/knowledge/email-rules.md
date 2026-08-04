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
- **Triage:** Keyword rules first (junk/marketing), then Claude (`EMAIL_AI_ENABLED`, needs `ANTHROPIC_API_KEY`). Rules are indefinite by default; optional `expires_at` stops matching after that time (admin Rules toggle, or chat when creating a rule).
- **Verification codes (global):** Built-in rule `VERIFICATION_CODE` matches OTP / login-code mail via regex (`verification code`, `access code`, `otp`, 4–8 digit codes, etc.) on **every installation** — always evaluated before other rules. Parsed code is stored on the inbox row; Email tab shows copy / delete / close actions and a dedicated push notification. **Auto-delete:** verification-code mail and its dashboard notification are removed **5 minutes** after arrival (override with `EMAIL_OTP_TTL_MINUTES`; set `0` to disable).
- **Routing:** Resolve sender via contact-api → match open job → append note to job body (`storeAppendWorkNote`).
- **UI:** Summaries in admin Email tab; junk hidden by default (`?junk=1` to show).
- **Attachments:** Resend attachment metadata is stored on the inbox row and shown in the Email detail pane with download links (`/api/email/inbox/:id/attachments/:attachmentId`). Attachment-only mail (signature + files, no body) is summarized by filename — not treated as blank. Linking an email to a project still imports files into that project's file grid.
- **Push:** Install `/admin` to home screen → tap 🔔 → Web Push (`VAPID_*` env vars).
- **Sleep mode:** Default **11 PM–7 AM** (timezone configurable). During quiet hours inbound mail is stored as **Sleep deferred** (no Claude triage, no agent alerts, no push). Catch-up triage runs automatically after the window ends. Adjust in admin menu → **Sleep mode**.
- **Railway crash emails:** Rule `RAILWAY_ALERT` matches “Deployment crashed” / “Build failed” / `railway.app` in subject/body. When `RAILWAY_INCIDENT_HANDLER=1`, routed through **deploy-incident handler** (repo lock + agent). **Default: off** — alerts queue in Email / System alerts without auto-investigation.
- **Railway webhooks:** Direct deploy-failure webhooks → `/api/railway/webhook` → same handler when `RAILWAY_INCIDENT_HANDLER=1` (otherwise logged only). Configure on each Railway project. See `RAILWAY_WEBHOOK_INGRESS_KEY` + `AGENT_ALERT_USER_ID` + `DATABASE_URL`.

## Categories

| category | meaning |
|----------|---------|
| `junk` | Marketing/newsletter — hidden from default inbox |
| `client` | Client/project mail — may auto-file to job |
| `alert` | Uptime, security, monitoring |
| `internal` | Admin/personal, not client work |
| `review` | Needs your decision |
| `VERIFICATION_CODE` | OTP / login code — copy in Email tab (status label; category is `review`) |

## Environment

| var | purpose |
|-----|---------|
| `RESEND_API_KEY` / `RESEND_WEBHOOK_SECRET` | Resend receiving + webhook verify |
| `ANTHROPIC_API_KEY` | Summarize + classify + pick job |
| `EMAIL_AI_ENABLED` | Set `0` to disable AI (rules-only) |
| `EMAIL_INBOUND_SINCE` | Optional ISO date — ignore mail sent before this (overrides DB cutoff) |
| `EMAIL_INBOUND_FILTER` | Set `0` to disable the send-date cutoff (process all forwarded mail) |
| `EMAIL_OTP_TTL_MINUTES` | Minutes before verification-code mail + dashboard alert auto-delete (default **5**; `0` disables) |
| `EMAIL_CLEANUP_POLL_SECONDS` | How often the expiry cleanup job runs (default **60**) |
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
