# content_management — deployment checklist

**Feature id:** `content_management`  
**Default status:** `request` (opt-in per install)

## What it is

A **front-end module label** for a capability that already ships in the platform: the owner updates their public website by asking the agent — no WordPress, no Webflow, no separate CMS login.

This plugin adds marketing copy on `/modules`, an agent playbook, and optional install gating. It does **not** add new agent tools.

## Enable

```json
{
  "features": ["content_management", "dev_infra", "..."],
  "siteContentKey": "your-brand"
}
```

- `content_management` — surfaces the module and loads the playbook
- `dev_infra` — provides `write_github_file` and deploy status (required to persist edits from Railway)
- `code_dev` — optional; `read_file` / local edits when developing on a checkout

Site content file: `config/sites/your-brand-config.json`

## Required env

| Variable | Purpose |
|----------|---------|
| `GITHUB_TOKEN` | PAT with **Contents** write (`write_github_file`) |
| `GITHUB_REPO` | `owner/repo` (or Railway git vars) |

Optional: `PEXELS_API_KEY` for stock photos.

## Verify

1. `/modules` shows **Website Content Management**
2. `/features` core tour includes "Update your website by asking — no CMS"
3. In admin chat: "Change our homepage headline to …" → agent uses `read_file` + `write_github_file`
4. After deploy, live site reflects the change
