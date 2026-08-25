# content_management — Agentic Website Editor

**Feature id:** `content_management`  
**Default status:** `request` (opt-in per install)

## What it is

The owner updates their **public front-end website** by asking the agent — no WordPress, no Webflow, no separate CMS login. This module owns **Git publish** (`write_github_file`, `read_github_file`, `undo_website_change`).

The website is **its own GitHub repo** in the agency account (usually `eliteweblabs/{slug}-site`). Client installs are locked to that repo. They cannot edit `eliteweblabs/reave` — only the agency owner on the official reΛVe.app install can change the app.

Railway / Kinsta APIs are **not** part of this module. Those stay on the private `dev_infra` pack.

## Enable

```json
{
  "features": ["content_management", "..."],
  "siteContentKey": "your-brand",
  "websiteRepo": "eliteweblabs/your-brand-site"
}
```

Or set `GITHUB_WEBSITE_REPO=eliteweblabs/your-brand-site` on the Railway service.

Tony-style installs (public site not in the reΛVe.app) need this repo + token before the editor can do anything. Do not point them at `eliteweblabs/reave`.

## Required env

| Variable | Purpose |
|----------|---------|
| `GITHUB_WEBSITE_REPO` | `owner/repo` (or `websiteRepo` in install config) |
| `GITHUB_APP_ID` / `GITHUB_APP_INSTALLATION_ID` / `GITHUB_APP_PRIVATE_KEY` | Created by deploy wizard Apply — mints a Contents token for **only** the website repo |
| `GITHUB_TOKEN` | Optional. Do not copy the official reΛVe.app PAT onto a client. |

Optional: `PEXELS_API_KEY` for stock photos.

GitHub cannot create PATs via API. Official reΛVe.app Apply creates `eliteweblabs/{slug}-site` and a restricted GitHub App for that repo, then writes the App credentials onto the client.

## Verify

1. Demo loader / deploy wizard shows **Agentic Website Editor** under Web Development
2. In admin chat: "Change our homepage headline to …" → agent uses `write_github_file` on the website repo **in the same turn** (no “should I commit?”)
3. "Undo that" → `undo_website_change`
4. Asking the agent to edit reΛVe.app / another repo is refused
5. After the host deploys the **website** repo, the live site reflects the change
