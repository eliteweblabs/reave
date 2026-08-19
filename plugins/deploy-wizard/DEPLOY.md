---
feature: deploy_wizard
defaultStatus: deployed
stage: 1
visibility: private
---

# Deploy wizard

Super-admin module for the official REΛVE Railway install only. Do not add `deploy_wizard` to client `features[]`.

## Sibling services

- None (uses the host’s `RAILWAY_API_TOKEN` to create the project / missing services and write variables)

## Required env vars

- `RAILWAY_API_TOKEN` — optional; needed only for Apply. CLI copy works without it.
- For client **Website** / Agentic Website Editor on Apply:
  - `GITHUB_TOKEN` — classic PAT with `repo` scope (create `{slug}-site` and attach the App). GitHub cannot mint PATs.
  - `GITHUB_APP_*` — created on Apply (GitHub App manifest + install on `{slug}-site` only). Reused if already set on this host.

## External setup

- Add `deploy_wizard` to `config/config-reave.json` → `features[]`
- Add `deploy` to that same file’s `footerNav` so the dashboard tile appears
- Confirm `INSTALL_CONFIG=reave` (or `PUBLIC_SITE_DOMAIN=reave.app`)

## Checklist

- [ ] Module is in `config-reave.json` only
- [ ] Dashboard shows **Deploy wizard** and opens `/deploy`
- [ ] Client installs 404 `/deploy` and hide the tile
- [ ] Owner sign-in is still required on reave.app
