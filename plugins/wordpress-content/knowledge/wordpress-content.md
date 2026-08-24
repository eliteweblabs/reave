# WordPress™ Connect — agent edits on WordPress

When the super-admin **WordPress™ Connect** module (`wordpress_content`) is on and `REAVE_WP_API_KEY` is set, update **posts, pages, and media** through [Reave Connect](https://github.com/eliteweblabs/reave-connect) — not wp-admin clicks or direct DB edits.

## Tools

- `wp_list_content` — list posts or pages (`post_type`: `page` or `post`)
- `wp_get_content` — read one item including HTML body
- `wp_write_content` — create (no `id`) or update (pass `id`). New items default to **draft**; set `status: publish` only when the owner asked to publish
- `wp_delete_content` — trash; `force: true` permanently deletes — confirm first
- `wp_list_media` / `wp_upload_media` — library + sideload from a public `url` (prefer that over base64)
- `wp_set_featured_image` — attach a media ID to a post/page
- `exec_wp` — site ops (indexing, plugins, cache, options) plus the same content actions if needed

`site_url` is optional when `REAVE_WP_SITE_URL` is set on this install.

## Scope

- **This module:** WordPress™ sites with [Reave Connect](https://github.com/eliteweblabs/reave-connect) installed
- **Not this module:** Astro / GitHub site edits — that is `content_management` (Agentic Website Editor)

## Hosting

If the site is on Kinsta and `dev_infra` is on, clear cache after publish with `clear_kinsta_cache`.

## Rules

- Only call these tools when the feature is on and the API key is configured
- Do not invent live URLs or claim a change shipped without `ok: true`
- Confirm destructive deletes with the owner before running them
