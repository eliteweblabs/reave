---
feature: wordpress_content
defaultStatus: deployed
stage: 2
---

# wordpress_content — deployment checklist

**Feature id:** `wordpress_content`  
**Default status:** `deployed` (optional add-on; not baseline)

## What it is

A **WordPress companion plugin** (Reave Connect) so the Reave agent can update posts, pages, and media on an existing WordPress site — without the owner logging into wp-admin for every copy change.

This is separate from `content_management` (Agentic Website Editor — Astro / GitHub / no CMS). Enable only for installs that keep WordPress as the public site.

## Enable

```json
{
  "features": ["wordpress_content", "..."]
}
```

## Required setup

| Piece | Purpose |
|-------|---------|
| Reave Connect plugin | `wp-plugin/reave-connect/` on the WordPress site |
| `REAVE_WP_API_KEY` | Same value as the plugin’s API key (`X-Reave-Key`) |
| `REAVE_WP_SITE_URL` | Optional default site URL so tools can omit `site_url` |
| Optional: Kinsta (`dev_infra`) | `clear_kinsta_cache` after publish |

## Checklist

- [ ] Add `wordpress_content` to install `features[]`
- [ ] Set `REAVE_WP_API_KEY` on the Reave App Railway service
- [ ] Install / update Reave Connect on the WordPress site (auto-updates from `/api/wp-update/reave-connect/`)
- [ ] Paste the same API key in WP Admin → Settings → Reave Connect
- [ ] Optional: set `REAVE_WP_SITE_URL` to that site’s public URL
- [ ] Ask the agent to list pages (`wp_list_content`) and draft or update a page
- [ ] Confirm a write returns `ok` before claiming the site changed
