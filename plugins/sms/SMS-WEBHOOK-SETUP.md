# Telnyx SMS webhook setup

Reusable checklist for wiring a Telnyx number to Reave inbound SMS handling (admin alerts, optional email forward, optional AI auto-reply).

Fill in the bracketed values per client/install.

---

## Telnyx SMS-to-Email Webhook Setup

**Business:** [NAME]  
**Phone Number:** [413 NUMBER or E.164, e.g. +14135551234]  
**SMS Destination Email:** [EMAIL ADDRESS]  
**Telnyx Account:** [portal.telnyx.com → API Keys]

**Goal:** Incoming SMS on [PHONE NUMBER] reaches [EMAIL ADDRESS] (and/or admin dashboard) without a separate number or extra infrastructure.

---

## 1. Webhook endpoint (Reave)

Reave already exposes the Telnyx inbound webhook:

| Item | Value |
|------|--------|
| **URL** | `https://<production-host>/api/sms` |
| **Method** | POST |
| **Handler** | `src/pages/api/sms.ts` → `src/lib/inboundSmsHandler.ts` |
| **Signature** | ED25519 via `TELNYX_WEBHOOK_PUBLIC_KEY` |

The handler parses Telnyx `message.received` events: sender, recipient number, message body, message id. It returns HTTP 200 immediately and processes async.

---

## 2. Railway / install env vars

Set on the Astro service (Railway → Variables):

| Variable | Example | Purpose |
|----------|---------|---------|
| `TELNYX_API_KEY` | `KEY…` | Telnyx API (outbound SMS + portal) |
| `TELNYX_FROM_NUMBER` | `+14135551234` | E.164 number on the messaging profile |
| `TELNYX_WEBHOOK_PUBLIC_KEY` | base64 key from portal | Validates inbound webhooks |
| `SMS_NOTIFY_EMAIL` | `owner@example.com` | Forward each inbound SMS to this email (Resend) |
| `RESEND_API_KEY` | — | Required when `SMS_NOTIFY_EMAIL` is set |
| `RESEND_FROM` | `hello@example.com` | From address for forwarded SMS emails |
| `AGENT_ALERT_USER_ID` | Clerk user id | Posts to admin → Chats → System alerts + push |
| `SMS_ALLOWED_SENDERS` | *(optional)* | Comma-separated E.164 allowlist; empty = all |
| `SMS_AI_REPLY_ENABLED` | `1` | *(optional)* Claude auto-replies via Telnyx |

Local dev only: `TELNYX_WEBHOOK_SKIP_VERIFY=1` when the public key is unset. **Never in production.**

---

## 3. Telnyx Messaging Profile

In [Telnyx portal](https://portal.telnyx.com):

1. **Messaging → Messaging Profiles** — create or open the profile for [NAME].
2. **Inbound webhook URL:** `https://<production-host>/api/sms`
3. **Failover URL:** same URL or a backup host (Telnyx retries on failure).
4. Copy the **Webhook public key** → `TELNYX_WEBHOOK_PUBLIC_KEY`.
5. **Numbers → [PHONE NUMBER]** — assign this messaging profile.
6. Confirm **10DLC / A2P** campaign is approved for US local numbers (see `seeds/todos/telnyx-setup.md`).

If the install also uses voice, set Call Control webhook to `https://<host>/api/voice/webhook` (same public key).

---

## 4. Email delivery (when `SMS_NOTIFY_EMAIL` is set)

| Field | Format |
|-------|--------|
| **From** | `RESEND_FROM` or company outbound email |
| **To** | `SMS_NOTIFY_EMAIL` |
| **Subject** | `SMS from [SENDER]: [YOUR NUMBER]` |
| **Body** | Message text, received timestamp, reply instructions (text the number back or use admin chat) |

Admin alerts (`AGENT_ALERT_USER_ID`) still fire in parallel when set — email forward is additive.

---

## 5. Testing

- [ ] Send a test SMS to [PHONE NUMBER] from a mobile phone.
- [ ] Telnyx portal → **Debugging → Webhooks** — confirm 200 from `/api/sms`.
- [ ] Verify email lands at [EMAIL ADDRESS] (check spam).
- [ ] Confirm sender number appears correctly in subject/body.
- [ ] If `AGENT_ALERT_USER_ID` is set: admin → Chats → System alerts shows the message + push.
- [ ] Optional: set `SMS_AI_REPLY_ENABLED=1` and confirm auto-reply.

**Rate limits:** Telnyx messaging quotas follow your account/plan; Resend sending limits apply to email forward volume.

---

## 6. Maintenance

- Monitor Telnyx **Debugging → Webhooks** for 4xx/5xx on `/api/sms`.
- Railway logs: `[sms] inbound`, `[sms] email forward sent`, `[sms] handler error`.
- If emails stop: verify `RESEND_API_KEY`, `SMS_NOTIFY_EMAIL`, and Resend domain verification.
- Handoff doc: this file + `plugins/sms/DEPLOY.md` + `seeds/todos/telnyx-setup.md`.

---

## Deliverable checklist

- [ ] Working webhook URL live on production
- [ ] Messaging profile linked to [PHONE NUMBER]
- [ ] Env vars set on Railway
- [ ] Test SMS received at [EMAIL ADDRESS] (and/or admin alerts)
- [ ] Client handoff notes filed
