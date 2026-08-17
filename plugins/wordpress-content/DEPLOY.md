---
feature: wordpress_content
defaultStatus: development
stage: 3
---

# wordpress_content — deployment checklist

**Feature id:** `wordpress_content`  
**Default status:** `development` (optional add-on; not baseline)

## What it is

A **WordPress companion plugin** so the Reave agent can update posts, pages, and media on an existing WordPress site — without the owner logging into wp-admin for every copy change.

This is separate from `content_management` (Agentic Website Editor — Astro / GitHub / no CMS). Enable only for installs that keep WordPress as the public site.

## Enable

```json
{
  "features": ["wordpress_content", "..."],
  "moduleStatus": { "wordpress_content": "development" }
}
```

Flip `moduleStatus.wordpress_content` to `deployed` once the companion plugin is installed on the WP site and agent tools are wired.

## Required setup

| Piece | Purpose |
|-------|---------|
| WordPress companion plugin | Exposes authenticated content APIs for the agent |
| Application password / API key | Stored per client (vault) or install env |
| Optional: Kinsta (`dev_infra`) | `clear_kinsta_cache` after publish |

## Verify

1. `/modules` shows **WordPress Content Plugin**
2. Feature is **not** in demo baseline (`001`–`004`)
3. Admin Modules tab lists `wordpress_content` with status from DEPLOY / install config
4. When tools ship: chat "Update the About page headline to …" → WP API write + optional cache clear
