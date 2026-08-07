# content_management — deployment checklist

**Feature id:** `content_management`  
**Default status:** `request` (opt-in per install)

## What it does

Lets the business owner update their **public marketing website** through the admin agent — homepage headline, navigation, page copy, and assets — with changes committed to GitHub and deployed via Railway.

## Enable

Add to `config/config-{slug}.json`:

```json
{
  "features": ["content_management", "..."],
  "siteContentKey": "your-brand"
}
```

Site content file: `config/sites/your-brand-config.json`

## Required env (Reave Astro service)

| Variable | Purpose |
|----------|---------|
| `GITHUB_TOKEN` | PAT with **Contents** read + write |
| `GITHUB_REPO` | `owner/repo` (optional if Railway injects git vars) |
| `GITHUB_DEFAULT_BRANCH` | Usually `main` |

Optional: `PEXELS_API_KEY` for stock photo search (core tool, not gated by this feature).

## Agent tools (when enabled + token set)

- `get_site_content` — read nav, headline, section toggles
- `update_site_content` — commit structured config changes
- `write_website_file` — commit pages/components/assets (content paths only)

## Related features

| Feature | Relationship |
|---------|--------------|
| `dev_infra` | Full GitHub/Railway/Kinsta ops — not required for basic content edits |
| `code_dev` | Local read_file/write_file when developing on a checkout |
| `site_monitoring` | Watch for unintended content changes after deploy |

## Verify

1. `run_dev_task` → `service_status` — `github_write.can_write_files: true`
2. In admin chat: "What is our homepage headline?" → agent calls `get_site_content`
3. "Change the headline to …" → `update_site_content` → commit SHA returned
4. After deploy, confirm live site shows the new headline
