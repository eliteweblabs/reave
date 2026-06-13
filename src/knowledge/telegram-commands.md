# Telegram testing (no LLM required)

Plain commands supported by the webhook:

- `/list` — list knowledge slugs bundled in the app.
- `/get <slug>` — print the markdown for that slug (truncated if huge).

When `OPENAI_API_KEY` is set, freeform messages use a **small tool loop** so the model can call `list_knowledge` and `read_knowledge` before answering.
