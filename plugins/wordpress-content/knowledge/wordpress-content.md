# WordPress™ Connect — agent edits on WordPress

When the **WordPress™ Connect** module (`wordpress_content`) is on and `REAVE_WP_API_KEY` is set, manage the site through [Reave Connect](https://github.com/eliteweblabs/reave-connect) — not wp-admin clicks, SSH, or direct DB edits.

The PHP plugin is the only companion. Reave Bridge is retired; every Bridge capability is an `exec_wp` action here.

## Dedicated content tools

Prefer these when the owner asked to change copy or media:

- `wp_list_content` — list posts or pages (`post_type`: `page` or `post`)
- `wp_get_content` — read one item including HTML body and post meta
- `wp_write_content` — create (no `id`) or update (pass `id`). New items default to **draft**; set `status: publish` only when the owner asked to publish
- `wp_delete_content` — trash; `force: true` permanently deletes — confirm first
- `wp_list_media` / `wp_upload_media` — library + sideload from a public `url` (prefer that over base64)
- `wp_set_featured_image` — attach a media ID to a post/page

`site_url` is optional when `REAVE_WP_SITE_URL` is set on this install.

## Site ops via `exec_wp`

Same API key. Use `exec_wp` for everything that is not a dedicated `wp_*` tool.

**Health & indexing**

- `health` / `site_info` / `status` — WP/PHP versions, theme, plugin list
- `get_indexing_status` / `enable_indexing` / `disable_indexing`
- `list_plugins` / `activate_plugin` / `deactivate_plugin` / `install_plugin` (`slug`, optional `activate`)
- `get_active_theme`
- `flush_cache` — object cache, transients, Kinsta / Rocket / W3TC / LiteSpeed when present
- `flush_rewrite` — permalink rules
- `get_option` / `update_option` — auth salts and `reave_api_key` are blocked
- `search_replace` — `{ search, replace, dry_run? }`. **Always dry-run first** (`dry_run` defaults true). Only run live after the owner confirmed the match counts.

**Menus** (from Bridge)

- `list_menus`
- `get_menu_items` — `{ id }` (menu term id)
- `update_menu_item` — `{ menu_id, item_id, title?, url?, target? }`

**Redirects** (from Bridge)

- `list_redirects`
- `create_redirect` — `{ from, to, code? }` (301/302/307/308). Uses the Redirection plugin when it is installed; otherwise a lightweight table.
- `delete_redirect` — `{ id }`

**Post meta**

- `get_post_meta` / `update_post_meta` — `{ id, key, value? }`
- `get_content` also returns flattened `meta`

## Scope

- **This module:** WordPress™ sites with [Reave Connect](https://github.com/eliteweblabs/reave-connect) installed
- **Not this module:** Astro / GitHub site edits — that is `content_management` (Agentic Website Editor)

## Hosting

If the site is on Kinsta and `dev_infra` is on, clear cache after publish with `clear_kinsta_cache` (or `exec_wp` `flush_cache`).

## Rules

- Only call these tools when the feature is on and the API key is configured
- Do not invent live URLs or claim a change shipped without `ok: true`
- Confirm destructive deletes and live `search_replace` with the owner before running them
