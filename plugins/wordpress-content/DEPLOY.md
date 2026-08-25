---
feature: wordpress_content
defaultStatus: deployed
stage: 2
---

# wordpress_content — deployment checklist

**Feature id:** `wordpress_content`  
**Default status:** `deployed` (optional add-on; requestable from Admin → Add-ons)

## What it is

**WordPress™ Connect** — the reΛVe.app companion plugin so the agent can update posts, pages, media, menus, and redirects on an existing WordPress site without wp-admin for every change.

The PHP plugin lives in [`eliteweblabs/reave-connect`](https://github.com/eliteweblabs/reave-connect). This Reave module is the toggle, request flow, and agent tools. Reave Bridge is retired; its actions are Connect `exec_wp` actions.

This is separate from `content_management` (Agentic Website Editor — Astro / GitHub / no CMS). Enable only for installs that keep WordPress as the public site.

## Enable

Deployment owners request it (or toggle it if they are the install owner) in **Admin → Add-ons**. Official reΛVe.app also lists it in `config/config-reave.json` → `features`.

```json
{
  "features": ["wordpress_content", "..."]
}
```

## Required setup

| Piece | Purpose |
|-------|---------|
| Reave Connect plugin | Install from [GitHub Releases](https://github.com/eliteweblabs/reave-connect/releases/latest) |
| `REAVE_WP_API_KEY` | Same value as the plugin’s API key (`X-Reave-Key`) |
| `REAVE_WP_SITE_URL` | Optional default site URL so tools can omit `site_url` |
| Optional: Kinsta (`dev_infra`) | `clear_kinsta_cache` after publish |

## Checklist

- [ ] Owner requests or enables WordPress™ Connect in Add-ons (or `features[]`)
- [ ] Set `REAVE_WP_API_KEY` on the Reave App Railway service
- [ ] Install / update Reave Connect on the WordPress site (auto-updates from `/api/wp-update/reave-connect/`)
- [ ] Paste the same API key in WP Admin → Settings → Reave Connect
- [ ] Optional: set `REAVE_WP_SITE_URL` to that site’s public URL
- [ ] Ask the agent to list pages (`wp_list_content`) and draft or update a page
- [ ] Confirm a write returns `ok` before claiming the site changed
