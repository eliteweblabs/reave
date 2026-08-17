# Agentic Website Editor — no CMS, use the agent

When the owner asks to **update their public website** — headline, navigation, page copy, or images — handle it in chat. There is no separate CMS admin. Changes commit to GitHub and go live after the host that deploys this repo publishes (Railway, or any git-connected host).

## Tools (this module)

| Need | Tool |
|------|------|
| Read recent history | `get_recent_commits` / `get_git_status` |
| Commit config or page edits | `write_github_file` on `main` |
| Confirm it is live | `check_deployment_status` |
| Stock photos | `search_stock_photos` (Pexels, when configured) |
| Read local source (optional) | `read_file` when `code_dev` is on |

`GITHUB_TOKEN` is required to persist edits. Railway / Kinsta APIs are **not** required — those live on the private Dev & infrastructure module.

## Where website content lives

### Structured settings — `config/sites/{siteContentKey}-config.json`

Nav links, homepage headline (`heroHeadlineHtml`), section toggles, and the allowlist of public routes (`pages`). Update with `write_github_file`.

### Page body — Astro source

- `src/pages/` — routes (e.g. `about.astro`)
- `src/components/` — reusable sections
- Media library — company photos and logos (Admin → Media). Public URL is `/api/media/{slug}`.

Always **read before write**. For long pages, use `write_github_file` with `append:true` in sections — one oversized call gets cut off.

## Typical flows

### Change homepage headline

1. Read `config/sites/{key}-config.json` (`read_file` or GitHub)
2. Edit `homepage.heroHeadlineHtml`
3. `write_github_file` with `branch:"main"` and a clear commit message
4. Report commit URL; `check_deployment_status` when you need to confirm live

### Rewrite an About page

1. Read `src/pages/about.astro`
2. `write_github_file` with updated markup
3. One focused commit — never open a PR unless the user asks

### Add a nav link to a new page

1. Update `config/sites/{key}-config.json` — add path to `pages`, add link to `nav.links` or a group
2. Create `src/pages/new-page.astro` via `write_github_file`

## Images

- **Stock:** `search_stock_photos` — credit photographer + link to Pexels wherever displayed
- **Uploads:** Admin → Media (or WebDAV drop folder). Give the file a stable **slug**, then put that slug in `config/sites/{key}-config.json`.
- Do **not** commit page-content images to git. Product chrome (icons, favicons) may stay under `public/`.

## WordPress on Kinsta

For **WordPress client sites** with the companion plugin (`wordpress_content`), use that module’s playbook — not this Astro path.

## Rules

- **Never open a PR** — commit straight to `main` (see `github-dev-tools` knowledge)
- **Never invent URLs** on sites you cannot write to
- Confirm before removing paths from the `pages` allowlist (middleware 404s disallowed routes)
- Do not claim the site is updated unless `write_github_file` succeeds
