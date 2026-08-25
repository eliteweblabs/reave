---
feature: website
defaultStatus: deployed
stage: 1
---

# Website — client website tools

**Feature id:** `website`  
**Visibility:** public — sold to clients. Not the agency hosting pack.

This module is the client-tier website product: edit the public site, search stock photos, publish through Git. It does **not** include Railway, Kinsta, Cloudflare, or Name.com APIs. Those stay on the private `dev_infra` pack for owner/agency installs (`opsInstall`).

Enabling `website` also turns on the Agentic Website Editor tools and Pexels search (when `PEXELS_API_KEY` is set), so a client install does not need separate `content_management` / `stock_photos` flags.

## Sibling services

- None — publishes through whatever host deploys the site repo

## Required env vars

- `GITHUB_WEBSITE_REPO` — `owner/repo` for this install’s front-end (not `eliteweblabs/reave`)
- `GITHUB_APP_ID` / `GITHUB_APP_INSTALLATION_ID` / `GITHUB_APP_PRIVATE_KEY` — created by deploy wizard Apply
- `PEXELS_API_KEY` — optional; stock photo search

## External setup

- Enable `website` in install config `features[]`
- Prefer deploy wizard Apply (creates `{slug}-site` and a restricted GitHub App for that repo)
- Do **not** enable `dev_infra` on a client install
- Do **not** copy the reΛVe.app host `GITHUB_TOKEN`

## Checklist

- [ ] Add `website` to install `features[]`
- [ ] Apply from `/deploy` with Website on — or set `GITHUB_WEBSITE_REPO` + `GITHUB_APP_*`
- [ ] Optional: set `PEXELS_API_KEY`
- [ ] Ask the agent what web tools it has — Railway / Kinsta / Cloudflare must not appear
- [ ] “Change the headline…” commits in the same turn; “undo that” reverts
- [ ] Set `moduleStatus.website` → `deployed`
