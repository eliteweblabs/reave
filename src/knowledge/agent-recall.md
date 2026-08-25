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
4. A new or rewritten note sends a Web Push + dashboard banner (`🧠 Memory saved` / `updated`). Identical re-saves and owner edits from `POST /api/admin/memories` stay quiet. Several extract items from one turn share one notification.

Personal facts are scoped to the signed-in admin. Shared business habits are install-wide.

## How a new chat sees it

Each run injects:

1. **Who you work for** — company name/domain and the deployment owner (Profile / `ADMIN_USERNAME` / contact-api).
2. **Recent Sessions** — last dozen titles so the agent can see work it already did (including an open deploy-failure repair) and `get_chat` instead of starting over.
3. A short **Durable recall** block. If the list is long, the agent can `search_memories` / `list_memories`. `forget_memory` (or `DELETE /api/admin/memories`) drops a note the owner says is wrong.

This is not the knowledge playbook store. Playbooks stay in Knowledge (`write_knowledge`). Recall is the short “already know this” list.

Deploy-failure repairs are one Session per Railway service. Later crashes append to that same chat so the agent continues the fix instead of opening nine identical “Deploy failed — …” threads.
