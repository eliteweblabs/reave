# Knowledge directory

This folder holds **bundled agent playbooks** (markdown) for the Reave product. It does **not** hold live company data.

## What belongs here (git)

| Path | Purpose |
|------|---------|
| `*.md` (top level) | Generic product playbooks — same on every install |
| `installs/{slug}/*.md` | Install-scoped playbooks (only loaded when `INSTALL_SLUG` matches) |
| `industries/{id}/*.md` | Industry **templates** (only when `DEMO_INDUSTRY` matches, e.g. law) |
| `plugins/{id}/knowledge/` | Add-on playbooks (see `plugins/README.md`) — never duplicate here |

Bundled playbooks are read from disk. Module playbooks are **never** copied into Postgres.

## What does **not** belong here

**Company-specific live data** belongs in this install’s **Postgres** (`DATABASE_URL` on Railway), not in git:

- Knowledge entries the owner or agent edits (`knowledge` table — Admin → Knowledge)
- Company profile / branding (`company_config`)
- Personal to-dos (`todos`)
- Email inbox, rules, drafts
- Chats, agent memories, jobs/work notes
- Deck industries (official reave.app only)
- Module catalog, newsletter lists, push subscriptions, integration tokens, etc.

When `DATABASE_URL` is unset (local dev), stores fall back to **ephemeral JSON** under this directory. Those files are **gitignored** — they must not be committed or shared across installs.

## Install config vs knowledge

Public HTML, enabled modules, and deploy status come from **`config/config-{slug}.json`** at the project root (`INSTALL_SLUG` env var), not from this folder.

Company name, logo, domain, Vapi prompt, and similar runtime branding live in **Postgres** (`company_config`) with the same JSON fallback pattern when Postgres is off.

## Seeds (not knowledge)

One-time bootstrap data lives outside this tree:

- `seeds/todos/*.md` — optional reave.app product-backlog checkboxes seeded into an empty `todos` table once, then purged on client installs

## Jobs and chats

- `jobs/` and `chats/` are **empty placeholders** (`.gitkeep` only). Runtime job markdown and chat threads are written here only when Postgres is off; those files are gitignored.

## Admin API

- **Admin UI:** `/api/admin/knowledge` → Postgres + bundled fallback (`knowledgeStore.ts`)
- **Agent tools:** `read_knowledge` / `write_knowledge` → same store (writes require Postgres)
- Legacy `/api/knowledge` (filesystem writes) is removed — do not add file-based knowledge APIs
