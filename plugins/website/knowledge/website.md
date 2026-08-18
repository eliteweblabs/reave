# Website — client website tools

This install’s **web tools** are the client Website module. Use them to edit the public site and find imagery. Do **not** list Railway, Kinsta, Cloudflare, or Name.com as web tools — those are agency/ops APIs and are not on a client install.

## What you have

| Need | Tool |
|------|------|
| Change headline, nav, copy, images | `write_github_file` on `main` (Agentic Website Editor) |
| See what shipped | `get_git_status` / `get_recent_commits` / `check_deployment_status` |
| Find a photo | `search_stock_photos` (Pexels, when the key is set) |
| Site playbook | `read_knowledge` slug `content-management` |

## What you do not have

- Railway deploy/log API (`RAILWAY_API_TOKEN`)
- Kinsta WordPress hosting API
- Cloudflare DNS/SSL API
- Name.com registrar API

If those appear “not configured,” they are still the wrong product. Say they are not part of this client install. Do not ask the owner for hosting API tokens.

## Publish

Commits to `main` publish through whatever host deploys this repo. You do not need a Railway or Kinsta token to ship a copy change.
