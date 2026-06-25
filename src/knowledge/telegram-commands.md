# Telegram bot — what to say

Quick cheat sheet at **`/dev/telegram`**. Type a slash command, or just talk to
the bot in plain English (freeform needs `ANTHROPIC_API_KEY`).

## Slash commands (instant, no LLM)

- `/help` — in-chat menu of commands + examples
- `/knowledge` (or `/start`) — list bundled knowledge docs (slugs)
- `/get <slug>` — read a knowledge doc
- `/resolve <name>` (or `/who`) — fuzzy-find a client in contact-api
- `/railway project <name>` (and `/railway help`) — new empty Railway project
- `/clear` (or `/reset`) — forget this chat's conversation history

### Voice & SMS (Telnyx)

- `/voice on|off` — enable or disable the AI phone agent for inbound calls (resets on restart; set `VOICE_AGENT_ENABLED=1` to persist)
- `/calls` — list all currently active calls (from number, mode, duration)
- `/takeover <phone>` — transfer the active call from that number to `TELNYX_OPERATOR_NUMBER`

## Plain English (Claude tool loop)

- **Clients:** "list my contacts", "add a client named …", "what's <name>'s portal link?", "who is t. smith?"
- **Add new:** run `/contacts`, tap **➕ Add New** at the top, then send the details in one message (`Name | email | phone | company` — only the name is required).
- **Edit info:** run `/contacts <name>`, tap **Meta**, pick a field (first name, last name, company, phone, email), then send the new value in the chat. Old values are kept as aliases.
- **Portal:** "set <name>'s page headline … body …", "add a field Plan → Annual", "add Data to <name>: WordPress login …", "hide/re-enable <name>'s page"
- **Send:** "send <name> their link" (emails, or texts if no email on file via Telnyx)
- **Billing:** "invoice <name> $100 for …", "who has an unpaid invoice?", "record a $50 payment from <name>", "list recent invoices"
- **Dev/deploy:** "is the latest code live?", "show recent commits", "git status", "list branches", "run a service status check"
- **GitHub edits:** "update `src/foo.ts` on branch `fix/thing` and open a PR to main", "commit this file to GitHub" (see bundled slug **`github-dev-tools`**)
- **Knowledge:** "what's our email triage rule?" (reads bundled docs)

Names are fuzzy-matched; if ambiguous, the bot lists candidates to confirm.
Recent chat history is kept, so follow-ups like "yes, do it" work.
