# Email triage (Reave)

Inbound email automation lives **inside this Astro app** — there is no separate
Email Tools service. Mail arrives via a **Resend inbound webhook**, gets classified
by a keyword rule table, and (when a rule says so) pings this Telegram bot.

## Flow

```
Sender → Resend (MX on a reave.app subdomain) → POST /api/email/inbound
       → verify svix signature → fetch full email → classifyEmail() → Telegram alert
```

- Route: `src/pages/api/email/inbound.ts` (signature-verified, always returns 200).
- Engine: `src/lib/emailRules.ts` (`DEFAULT_RULES`, `classifyEmail`).
- Pipeline: `src/lib/inboundEmailHandler.ts` (sender allowlist → classify → notify).

## Rules

Each rule matches case-insensitive `phrases` against chosen `fields`
(`subject` / `body` / `from`), resolves a `status`, and decides `notify`.
First enabled match wins; unmatched mail notifies by default (`NOTIFY_ON_UNMATCHED`).

Default table (ported from the old `status-rules.json`):

| status | trigger | notify |
|--------|---------|--------|
| `DELETE` | marketing trash (`unsubscribe`, `you received this because`) | no |
| `AUTO_ARCHIVED` | Google Workspace monthly invoice | no |
| `DOWN` | `UptimeRobot` alerts | yes |
| `NEEDS_CHECK` | security alerts (`Security alert`, `App password used`, …) | yes |

Tune by editing `DEFAULT_RULES` in `src/lib/emailRules.ts`.

## Environment

| var | purpose |
|-----|---------|
| `RESEND_API_KEY` | Resend key (receiving + fetch full email) |
| `RESEND_WEBHOOK_SECRET` | `whsec_…` signing secret for the inbound webhook |
| `EMAIL_NOTIFY_CHAT_ID` | chat for alerts (falls back to `TELEGRAM_DEPLOY_NOTIFY_CHAT_ID`) |
| `EMAIL_ALLOWED_SENDERS` / `EMAIL_ALLOWED_DOMAINS` | optional allowlists; if both empty, all senders are processed |

## Security

Untrusted inbound email is **never** executed or fed into an LLM prompt — it is
only classified by literal phrase matching and surfaced to Telegram. Webhook
signatures are verified (svix) before anything is processed. Use the allowlist
envs to restrict senders when you want strict triage.

## Setup (one-time)

1. Resend dashboard → enable receiving on a `reave.app` subdomain (add the MX record).
2. Create a webhook for `email.received` pointing at `https://reave.app/api/email/inbound`; copy the `whsec_…` secret.
3. Set `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_NOTIFY_CHAT_ID` on the Astro service.
