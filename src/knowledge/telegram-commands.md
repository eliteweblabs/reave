# Telegram testing (no LLM required)

Plain commands supported by the webhook:

- `/list` — list knowledge slugs bundled in the app.
- `/get <slug>` — print the markdown for that slug (truncated if huge).

When `ANTHROPIC_API_KEY` is set, freeform messages use a **small tool loop** (Claude) so the model can call `list_knowledge`, `read_knowledge`, `create_invoice`, and more before answering.
