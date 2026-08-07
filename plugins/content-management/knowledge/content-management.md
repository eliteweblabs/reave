# Website content management — agent playbook

Use these tools when the owner asks to **update their public website** — headline, navigation, page copy, images, or which pages are live. This module is end-user facing; keep language plain and confirm destructive changes.

## Prerequisites

| Requirement | Purpose |
|-------------|---------|
| `content_management` feature enabled | Gates the tools |
| `GITHUB_TOKEN` with **Contents** write | Commits persist to GitHub |
| `GITHUB_REPO` or Railway git vars | Target repo (usually this Astro app) |
| `siteContentKey` in install config | Which `config/sites/{key}-config.json` to edit |

Committing to **main** triggers a **Railway deploy** automatically. On production, there is no local git — all writes go through GitHub.

## Two layers of website content

### 1. Structured config — `config/sites/{key}-config.json`

Controls nav, homepage headline, section toggles, and the allowlist of public routes.

| Tool | Use |
|------|-----|
| `get_site_content` | Read current config before editing |
| `update_site_content` | Change headline, nav links/groups, CTAs, show/hide homepage sections, allowed pages |

Always call `get_site_content` first when the user asks "what does the homepage say?" or before changing nav.

### 2. Page body — Astro source files

Marketing copy, layouts, and components live under:

- `src/pages/` — routes (e.g. `about.astro`, `services.astro`)
- `src/components/` — sections reused across pages
- `src/assets/` / `public/` — images and static files

Use `write_website_file` for these. **Read before write** — use `read_file` (code_dev) or fetch from GitHub via `get_recent_commits` + prior content if needed.

For long pages (400+ lines), write in **sections** with `append:true` on the same path — one oversized call gets cut off and nothing is saved.

## Images

- **Stock photos:** `search_stock_photos` (Pexels) — credit the photographer and link to Pexels wherever the image appears.
- **Uploaded assets:** admin Media library or commit image files under `src/assets/` or `public/` via `write_website_file`.

## Typical flows

### Change homepage headline

1. `get_site_content` — show current headline
2. `update_site_content` with `hero_headline_html`
3. Report commit URL; deploy banner will show when live

### Add or reorder nav link

1. `get_site_content`
2. Build updated `nav_links` or `nav_groups` JSON array
3. `update_site_content` with the new JSON
4. If the page is new, also add its path to `pages` and create the `.astro` file with `write_website_file`

### Rewrite an About page

1. `read_file` on `src/pages/about.astro` (or grep for the section)
2. `write_website_file` with the updated markup
3. One focused commit message, e.g. "Update About page copy"

### WordPress on Kinsta (client sites)

This module edits **this Reave/Astro app repo**. For **Kinsta-hosted WordPress** client sites, content changes happen in wp-admin — you can `clear_kinsta_cache` after their team publishes (requires `dev_infra` + Kinsta env). Do not pretend `write_website_file` updates a client's WordPress theme.

## Rules

- **Never open a PR** unless the user explicitly asks — commit straight to `main`.
- **Never invent URLs** on sites you cannot write to.
- Confirm before removing pages from the `pages` allowlist (middleware returns 404 for disallowed routes).
- After tools succeed, tell the user the change is committed and will go live after deploy (~1–3 min on Railway).
- Call `read_knowledge slug "content-management"` when unsure which tool to use.
