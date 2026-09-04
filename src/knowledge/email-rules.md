# Email inbox (Reave)

Smart inbox inside **/admin → Email tab**. You read **summaries** here — not Proton/Gmail.

## Flow

```
Proton/Gmail (human mail) ──BCC/forward copy──► inbox@inbound.{company-domain} (Resend MX)
       │
       ▼
POST /api/email/inbound → Claude triage → contact-api → job append → Postgres
       │
       ▼
/admin Email tab (+ Web Push to phone PWA)
```

- **Ingest:** Resend webhook at `/api/email/inbound` (copy mail here; keep reading in Proton). Resend `email.received` webhooks are **account-wide** — if several installs share one API key, every inbound message is delivered to every webhook. Each install therefore ignores mail whose To/Cc/Bcc is not on `COMPANY_DOMAIN` / `PUBLIC_SITE_DOMAIN` / `PUBLIC_SITE_URL` / `RAILWAY_PUBLIC_DOMAIN` (plus optional `EMAIL_INBOUND_DOMAINS`). On Railway, a missing domain **rejects** rather than ingesting every shared-account message. Receiving address is `inbox@inbound.{domain}` (e.g. `inbox@inbound.tonybarlettajr.com`).
- **Cutoff:** Mail whose `Date` header is before go-live is dropped (not triaged, not stored). Cutoff auto-sets to the first webhook time; override with `EMAIL_INBOUND_SINCE`.
- **Sample inbox:** `SEED_ON_BOOT` writes fake `demo-*` messages when `RESEND_API_KEY` is blank. The first time that key goes from empty/null → set, those rows (and their alerts) are deleted so they do not mix with live mail. Changing an already-set key does not wipe. Sales `DEMO_MODE` keeps the sample inbox.
- **Triage:** For **unknown senders** and contacts marked **Service** (Google, Cloudflare, Apple, Stripe, etc.): Claude classifies first with a **confidence** score — **only when a keyword rule matched, or the owner turned on unmatched-chat**. High confidence → take the agent label. Low confidence → fall back to keyword rules; a dashboard **Explain** notification is only used when a keyword rule also matched. If nothing matches, the message stays in the inbox (no Claude, no notice, no agent chat) unless **Rules → Open a chat when no rule matches** is on. That switch is **off by default**. Known professional/personal clients keep rules-first + Claude for leftovers when a rule matched (or the same switch is on). Set `EMAIL_AI_CONFIDENCE_MIN` (default **0.72**) to tune the gate. Disable AI with `EMAIL_AI_ENABLED=0`.
- **Rule priority:** Keyword rules are **sequential** — first enabled match wins, later rules are skipped. Sort order is the priority list (OTP/auth pinned first). Sender-specific silent rules (`from` + DELETE / notify:false) are inserted just after OTP/auth so they beat broad alert catch-alls. A matched silent rule hard-stops agent-first AI — Google “Security alert” junk cannot be re-opened as a dashboard alert. **New sign-in notices** (`detected a new sign-in`, `a new sign-in`, …) are a separate universal DELETE rule — they still apply to known/service contacts (Vercel, Google, Apple). Only the unsubscribe / opt-out catalog catch-all is skipped for Contacts. **Deleting an inbox row always dismisses its dashboard/push alerts** — a missing or junked email cannot keep a notification. Each rule can also list **Except (NOT)** phrases — if any appear in the searched fields, that rule does not match. **Email processing action** is the Then control: **Delete** (status `DELETE`) files the message in the Email tab **Deleted** review queue (it is not junk and is not removed until you delete it there); Archive / Receipt file silently; Keep leaves it in the inbox. Junk is only for a one-off hide or an AI guess (status `JUNK`). **Notify** is separate: **Push** and/or **Dashboard**, plus optional **notification buttons** (View, Archive, Delete, Copy code, Activate, Explain, Expense) that appear on the alert only — they do not process the email. **Forward to** relays matched mail via Resend; **forwarded mail does not auto-create a project** unless the rule’s **Also create a project** (`createProject`) is on, and a payment-receipt override cannot put forwarded mail on the Tax receipt dashboard. Keep the keyword ladder **minimal** — sharp phrases only. **Scope:** **Universal** catalog rules are owned by the official reave.app Railway install (`reave.app`). Only that install can create or edit them in Email Lab. Other installs get the seeded `DEFAULT_RULES` catalog read-only and cannot mark rules Universal. **Personal** rules are this install only (DB). **Else → Inbox:** when nothing matches, the message is filed in the Email inbox only — no Claude call, no dashboard notice, and no agent chat. The only way leftover mail opens a chat is the explicit **Open a chat when no rule matches** toggle on Rules (off by default). Create a permanent rule when the owner **teaches/corrects** from the dashboard (Expected / Always alert / Ignore / Teach). **Admin → Email Lab** is one screen: try an email, drag rule priority, tap a rule to edit it in-place, and play back dry-run triage.
- **Verification codes (global):** Built-in rule `VERIFICATION_CODE` matches OTP / login-code mail via regex **and known OTP sender addresses** (noreply@, accounts.google.com, id.apple.com, etc.; extend with `EMAIL_OTP_SENDERS`). Parsed code is stored on the inbox row; category is **`otp`**; Email tab shows copy / delete / close actions and a dedicated push notification — **tap copies the code** in the already-open admin window (does not navigate to `/admin/copy`). Cold start opens `/admin/?copy=1`. If the clipboard write is blocked, a **Copy code** sheet is shown (with close). Unsigned-in fallback is `/admin/copy` with a **Back to app** exit. Android also shows **Copy code · Delete** actions. Push still delivers after Clerk sign-out (the browser subscription stays until site data is cleared). **Auto-delete:** verification-code mail and its dashboard notification are removed **5 minutes** after arrival (override with `EMAIL_OTP_TTL_MINUTES`; set `0` to disable).
- **Activation / magic links (global):** Built-in rule `AUTH_LINK` matches magic sign-in / activation / one-click login **phrasing** (e.g. “magic sign-in link”, “secure link to”, “activation link”) **before** DELETE/junk — transactional footers often contain “unsubscribe” and must not bury these. A scraped CTA URL alone is **not** enough (avoids TikTok/social “Open …” false positives). Category **`auth_link`**; dashboard **Activate · Delete**. Same TTL as OTPs.
- **Receipts vs income vs dues:** Expense receipts (“you paid”, “your receipt from”, payment confirmation for a charge you made) file as tax receipts. Income notices (`Payment of $… from …`, “payment from”, deposited funds) are **not** receipts — “from” means money received. Stripe Capital / outstanding / upcoming minimum / failed payment / debit-initiated language is also **not** a receipt (agent label `failed_payment` or alert). **Shipment tracked / shipment tracking / “your order has shipped”** notices auto-archive (`AUTO_ARCHIVED`) — they are shipping updates, not tax receipts. Amazon order confirmations (“auto confirm”, “Ordered:”, “you paid”) still file as receipts. A completed payment receipt can override a junk/DELETE rule so it still lands on the Tax receipt dashboard — **except when the matched rule has Forward to**. Forwarded mail stays silent (no dashboard / push) and is only relayed.
- **Routing:** Resolve sender via contact-api → match open job → append note to job body (`storeAppendWorkNote`).
- **UI:** Summaries in admin Email tab; junk hidden by default (`?junk=1` to show).
- **Attachments:** Resend attachment metadata is stored on the inbox row and shown in the Email detail pane with download links (`/api/email/inbox/:id/attachments/:attachmentId`). Attachment-only mail (signature + files, no body) is summarized by filename — not treated as blank. Linking an email to a project still imports files into that project's file grid.
- **Push:** Install `/admin` to home screen → tap 🔔 → Web Push (`VAPID_*` env vars).
- **Sleep mode:** Default **11 PM–7 AM** (timezone configurable). During quiet hours inbound mail is **stored in the inbox with its real arrival time** and notifications are paused. Claude triage / agent alerts / push wait until the window ends, then run **in place** on those rows (the received timestamp is not rewritten). Owner-initiated **Siri Shortcuts** bypass sleep mode (including audit research, freeform agent prompts, and completion push). Adjust in Administration → **Settings** → Sleep mode.
- **Railway crash emails:** Rule `RAILWAY_ALERT` matches “Deployment crashed” / “Build failed” / `railway.app` in subject/body. When `RAILWAY_INCIDENT_HANDLER=1`, routed through **deploy-incident handler** (repo lock + agent). **Default: off** — alerts queue in Email / System alerts without auto-investigation.
- **Railway webhooks:** Direct deploy-failure webhooks → `/api/railway/webhook` → deploy indicator only unless `DEPLOY_FAILURE_AUTO_REPAIR=1`. With `RAILWAY_INCIDENT_HANDLER=1` (also opt-in), repo lock + verify loop. Configure on each Railway project. See `RAILWAY_WEBHOOK_INGRESS_KEY` + `AGENT_ALERT_USER_ID` + `DATABASE_URL`.

## Categories

| category | meaning |
|----------|---------|
| `junk` | Marketing/newsletter — hidden from default inbox |
| `auto_deleted` | Matched a DELETE rule — hidden review queue so you can confirm the filter before permanently removing |
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
| `VAPID_SUBJECT` | e.g. `mailto:get@reave.app` |
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
