# Durable recall

The admin agent keeps a small **durable recall** list so the owner does not repeat themselves across Sessions.

## What gets kept

- Lasting **preferences** (tone, invoice terms, how to file work)
- **Procedures** already done that should be done the same way next time
- **Client / vendor habits** (who gets the invoice, how they like updates)
- Lasting **decisions**
- Stable **facts** about the owner or the business

Casual one-off tasks, deploy status, and secrets are not stored.

## How it is saved

1. Mid-turn: the agent calls `remember` when something durable shows up — the owner does **not** have to say “remember this.”
2. After the reply: a background Haiku pass extracts anything the turn missed.
3. Dedup is by `key` and similar wording. Repeating the same fact updates the existing note.

Personal facts are scoped to the signed-in admin. Shared business habits are install-wide.

## How a new chat sees it

Each run injects a short “Durable recall” block into the system prompt. If the list is long, the agent can `search_memories` / `list_memories`. `forget_memory` (or `DELETE /api/admin/memories`) drops a note the owner says is wrong.

This is not the knowledge playbook store. Playbooks stay in Knowledge (`write_knowledge`). Recall is the short “already know this” list.
