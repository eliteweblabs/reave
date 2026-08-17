# content_management — Agentic Website Editor

**Feature id:** `content_management`  
**Default status:** `request` (opt-in per install)

## What it is

The owner updates their public website by asking the agent — no WordPress, no Webflow, no separate CMS login. This module owns **Git publish** (`write_github_file` and related tools). The host that deploys the repo (Railway, or any git-connected host) is what makes the commit live.

Railway / Kinsta APIs are **not** part of this module. Those stay on the private `dev_infra` pack.

## Enable

```json
{
  "features": ["content_management", "..."],
  "siteContentKey": "your-brand"
}
```

Site content file: `config/sites/your-brand-config.json`

## Required env

| Variable | Purpose |
|----------|---------|
| `GITHUB_TOKEN` | PAT with **Contents** write (`write_github_file`) |
| `GITHUB_REPO` | `owner/repo` (or host git vars) |

Optional: `PEXELS_API_KEY` for stock photos. Optional: `code_dev` for local `read_file`.

## Verify

1. Demo loader / deploy wizard shows **Agentic Website Editor** under Web Development
2. In admin chat: "Change our homepage headline to …" → agent uses `write_github_file`
3. After the host deploys, the live site reflects the change
