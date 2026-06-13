# OpenClaw email tools — custom triggers (reference)

> **Source:** `openclaw-email-tools`. Snapshot: 2026-06-12. Not auto-synced — run this script after changes there.

---


Rules invoke side effects with `trigger:<name>` in the `do` array.

## Registered triggers (from `src/handlers/triggers.ts`)

| Name | Purpose |
|------|---------|
| `noop` | No-op (returns `{ ok: true }`). |
| `telegram` | POST to Telegram `sendMessage` using `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (Markdown body with status/from/subject). |
| `webhook` | POST JSON payload to `WEBHOOK_URL`. |
| `example-notify` | Stub / demo — replace for real notification side-effect. |

> **Note:** Separate from the `reave-1` Business OS webhook bot; may share the same bot token but uses `TELEGRAM_CHAT_ID` for outbound alerts.
