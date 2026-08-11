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
- **Triage:** For **unknown senders** and contacts marked **Service** (Google, Cloudflare, Apple, Stripe, etc.): Claude classifies first with a **confidence** score. High confidence → take the agent label. Low confidence → fall back to keyword rules and surface a dashboard **Explain** notification (opens the agent with the email). Known professional/personal clients keep rules-first + Claude for leftovers. Set `EMAIL_AI_CONFIDENCE_MIN` (default **0.72**) to tune the gate. Disable AI with `EMAIL_AI_ENABLED=0`.
- **Rule priority:** Keyword rules are **sequential** — first enabled match wins, later rules are skipped. Sort order is the priority list (OTP/auth pinned first). Sender-specific silent rules (`from` + DELETE / notify:false) are inserted just after OTP/auth so they beat broad alert catch-alls. A matched silent rule hard-stops agent-first AI — Google “Security alert” junk cannot be re-opened as a dashboard alert.
- **Verification codes (global):** Built-in rule `VERIFICATION_CODE` matches OTP / login-code mail via regex **and known OTP sender addresses** (noreply@, accounts.google.com, id.apple.com, etc.; extend with `EMAIL_OTP_SENDERS`). Parsed code is stored on the inbox row; category is **`otp`**; Email tab shows copy / delete / close actions and a dedicated push notification with **Copy code · Delete · ✕** (not generic View/Archive). **Auto-delete:** verification-code mail and its dashboard notification are removed **5 minutes** after arrival (override with `EMAIL_OTP_TTL_MINUTES`; set `0` to disable).
- **Activation / magic links (global):** Built-in rule `AUTH_LINK` matches magic sign-in / activation / one-click login **phrasing** (e.g. “magic sign-in link”, “secure link to”, “activation link”) **before** DELETE/junk — transactional footers often contain “unsubscribe” and must not bury these. A scraped CTA URL alone is **not** enough (avoids TikTok/social “Open …” false positives). Category **`auth_link`**; dashboard **Activate · Delete**. Same TTL as OTPs.
- **Receipts vs income vs dues:** Expense receipts (“you paid”, “your receipt from”, payment confirmation for a charge you made) file as tax receipts. Income notices (`Payment of $… from …`, “payment from”, deposited funds) are **not** receipts — “from” means money received. Stripe Capital / outstanding / upcoming minimum / failed payment language is also **not** a receipt (agent label `failed_payment` or alert).
- **Routing:** Resolve sender via contact-api → match open job → append note to job body (`storeAppendWorkNote`).
- **UI:** Summaries in admin Email tab; junk hidden by default (`?junk=1` to show).
- **Attachments:** Resend attachment metadata is stored on the inbox row and shown in the Email detail pane with download links (`/api/email/inbox/:id/attachments/:attachmentId`). Attachment-only mail (signature + files, no body) is summarized by filename — not treated as blank. Linking an email to a project still imports files into that project's file grid.
- **Push:** Install `/admin` to home screen → tap 🔔 → Web Push (`VAPID_*` env vars).
- **Sleep mode:** Default **11 PM–7 AM** (timezone configurable). During quiet hours inbound mail is stored as **Sleep deferred** (no Claude triage, no agent alerts, no push). Owner-initiated **Siri Shortcuts** bypass sleep mode (including audit research and completion push). Catch-up triage runs automatically after the window ends. Adjust in Administration → **Settings** → Sleep mode.
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
| `otp` | One-time verification / login code — copy in Email tab or dashboard banner |
| `auth_link` | Magic / activation / one-click sign-in link — Activate on dashboard (opens CTA, deletes email) |
| `VERIFICATION_CODE` | OTP status label (category is `otp`) |
| `AUTH_LINK` | Auth-link status label (category is `auth_link`) |

## Environment

| var | purpose |
|-----|---------|
| `RESEND_API_KEY` / `RESEND_WEBHOOK_SECRET` | Resend receiving + webhook verify |
| `ANTHROPIC_API_KEY` | Summarize + classify + pick job |
| `EMAIL_AI_ENABLED` | Set `0` to disable AI (rules-only) |
| `EMAIL_AI_CONFIDENCE_MIN` | Min confidence (0.5–0.99) to trust agent-first labels for unknown/service senders (default **0.72**) |
| `EMAIL_INBOUND_SINCE` | Optional ISO date — ignore mail sent before this (overrides DB cutoff) |
| `EMAIL_INBOUND_FILTER` | Set `0` to disable the send-date cutoff (process all forwarded mail) |
| `EMAIL_OTP_TTL_MINUTES` | Minutes before verification-code mail + dashboard alert auto-delete (default **5**; `0` disables) |
| `EMAIL_OTP_SENDERS` | Extra OTP sender domains or full addresses (comma-separated), merged with built-in list |
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
