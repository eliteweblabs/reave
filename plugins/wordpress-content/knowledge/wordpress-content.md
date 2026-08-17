# WordPress content plugin — agent edits on WordPress

When `wordpress_content` is enabled, the owner can ask the agent to update **posts, pages, and media** on their WordPress site. A companion plugin on that site exposes authenticated APIs; do not invent wp-admin clicks or direct DB edits.

## Scope

- **This module:** WordPress sites with the Reave companion plugin installed
- **Not this module:** Astro / GitHub site edits — that is `content_management` (Agentic Website Editor)

## Typical asks

- Change a page or post title, excerpt, or body
- Draft a new page or post
- Swap or upload featured media
- Publish or unpublish content the owner already approved in chat

## Hosting

If the site is on Kinsta and `dev_infra` is on, clear cache after publish with `clear_kinsta_cache`.

## Rules

- Only call WordPress content tools when this feature is enabled and credentials are configured
- Prefer the companion plugin API over scraping or guessing admin URLs
- Confirm destructive deletes with the owner before running them
- Never invent live URLs or claim a change shipped without an API success response
