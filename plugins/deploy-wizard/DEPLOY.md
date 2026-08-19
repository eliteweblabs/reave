---
feature: deploy_wizard
defaultStatus: deployed
stage: 1
visibility: private
---

# Deploy wizard

Super-admin module for the official REΛVE Railway install only. Do not add `deploy_wizard` to client `features[]`.

## Sibling services

- None (uses the host’s `RAILWAY_API_TOKEN` to write variables onto existing services)

## Required env vars

- `RAILWAY_API_TOKEN` — optional; needed only for Apply. CLI copy works without it.
- For client **Website** / Agentic Website Editor on Apply:
  - `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_INSTALLATION_ID` — GitHub App on eliteweblabs, selected repos only (not `eliteweblabs/reave`)
  - `GITHUB_TOKEN` — classic PAT with `repo` scope (create `{slug}-site` and add it to the App). GitHub cannot mint PATs.

## External setup

- Add `deploy_wizard` to `config/config-reave.json` → `features[]`
- Add `deploy` to that same file’s `footerNav` so the dashboard tile appears
- Confirm `INSTALL_CONFIG=reave` (or `PUBLIC_SITE_DOMAIN=reave.app`)

## Checklist

- [ ] Module is in `config-reave.json` only
- [ ] Dashboard shows **Deploy wizard** and opens `/deploy`
- [ ] Client installs 404 `/deploy` and hide the tile
- [ ] Owner sign-in is still required on reave.app
