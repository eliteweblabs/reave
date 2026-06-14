# Telegram bot — what to say

Quick cheat sheet at **`/dev/telegram`**. Type a slash command, or just talk to
the bot in plain English (freeform needs `ANTHROPIC_API_KEY`).

## Slash commands (instant, no LLM)

- `/help` — in-chat menu of commands + examples
- `/list` (or `/start`) — list bundled knowledge docs (slugs)
- `/get <slug>` — read a knowledge doc
- `/resolve <name>` (or `/who`) — fuzzy-find a client in contact-api
- `/invoice <customer> | <amount> [| description]` — create a Crater invoice
- `/railway project <name>` (and `/railway help`) — new empty Railway project
- `/clear` (or `/reset`) — forget this chat's conversation history

## Plain English (Claude tool loop)

- **Clients:** "list my contacts", "add a client named …", "what's <name>'s portal link?", "who is t. smith?"
- **Portal:** "set <name>'s page headline … body …", "add a field Plan → Annual", "add Data to <name>: WordPress login …", "hide/re-enable <name>'s page"
- **Send:** "send <name> their link" (emails, or texts if no email on file)
- **Billing:** "invoice <name> $100 for …", "who has an unpaid invoice?", "record a $50 payment from <name>", "list recent invoices"
- **Dev/deploy:** "is the latest code live?", "show recent commits", "git status", "list branches", "run a service status check"
- **Knowledge:** "what's our email triage rule?" (reads bundled docs)

Names are fuzzy-matched; if ambiguous, the bot lists candidates to confirm.
Recent chat history is kept, so follow-ups like "yes, do it" work.
