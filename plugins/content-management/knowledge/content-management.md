# Website content management — no CMS, use the agent

When the owner asks to **update their public website** — headline, navigation, page copy, or images — handle it in chat. There is no separate CMS admin. Changes commit to GitHub and go live after Railway deploys.

## Existing tools (no separate CMS product)

| Need | Tool | Feature |
|------|------|---------|
| Read site config or page source | `read_file` | `code_dev` (local) or fetch via GitHub |
| Commit config or page edits | `write_github_file` on `main` | `dev_infra` + `GITHUB_TOKEN` |
| Stock photos | `search_stock_photos` | Pexels (core when configured) |
| Verify deploy | `check_deployment_status` | `dev_infra` |

## Where website content lives

### Structured settings — `config/sites/{siteContentKey}-config.json`

Nav links, homepage headline (`heroHeadlineHtml`), section toggles, and the allowlist of public routes (`pages`). Read with `read_file`, update with `write_github_file`.

### Page body — Astro source

- `src/pages/` — routes (e.g. `about.astro`)
- `src/components/` — reusable sections
- Media library — company photos and logos (Admin → Media). Public URL is `/api/media/{slug}`.

Always **read before write**. For long pages, use `write_github_file` with `append:true` in sections — one oversized call gets cut off.

## Typical flows

### Change homepage headline

1. `read_file` on `config/sites/{key}-config.json`
2. Edit `homepage.heroHeadlineHtml`
3. `write_github_file` with `branch:"main"` and a clear commit message
4. Report commit URL; deploy banner shows when live

### Rewrite an About page

1. `read_file` on `src/pages/about.astro`
2. `write_github_file` with updated markup
3. One focused commit — never open a PR unless the user asks

### Add a nav link to a new page

1. Update `config/sites/{key}-config.json` — add path to `pages`, add link to `nav.links` or a group
2. Create `src/pages/new-page.astro` via `write_github_file`

## Images

- **Stock:** `search_stock_photos` — credit photographer + link to Pexels wherever displayed
- **Uploads:** Admin → Media (or WebDAV drop folder). Give the file a stable **slug**, then put that slug in `config/sites/{key}-config.json` (`aboutImage`, `clientLogos[].image`, `portfolio[].image`, landing `heroImage` / `photo.src` / property `image`). Tech-stack and replaced-app marks use media slugs in `src/lib/platformStack.ts` and `src/lib/brandLogos.ts`.
- Do **not** commit page-content images to git (about, portfolio, client logos, tech stack, replaced-app marks). Product chrome (REΛVE icons, favicons, background pattern) may stay under `public/`.

## WordPress on Kinsta

For **WordPress client sites** with the companion plugin (`wordpress_content`), use that module’s playbook and tools — not this Astro path. Without that feature, clients edit in wp-admin; you can still `clear_kinsta_cache` after they publish (`dev_infra` + Kinsta env).

## Rules

- **Never open a PR** — commit straight to `main` (see `github-dev-tools` knowledge)
- **Never invent URLs** on sites you cannot write to
- Confirm before removing paths from the `pages` allowlist (middleware 404s disallowed routes)
- Do not claim the site is updated unless `write_github_file` succeeds
