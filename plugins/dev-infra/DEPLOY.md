---
feature: dev_infra
defaultStatus: pending
stage: 3
---

# Dev & infrastructure deployment

## Sibling services

- None — agent tools call GitHub, Railway, and Kinsta APIs directly

## Required env vars

- `GITHUB_TOKEN` — repo status, commits, PRs (read/write scopes as needed)
- `RAILWAY_API_TOKEN` — projects, services, variables, domains, deployments, logs
- `RAILWAY_WORKSPACE_ID` — optional; required if name-only create fails
- `RAILWAY_WEBHOOK_INGRESS_KEY` — deploy failure alerts to admin
- `KINSTA_API_KEY` — WordPress site management
- `KINSTA_COMPANY_ID` — MyKinsta company UUID

## External setup

- Enable `dev_infra` in install config `features[]`
- Create Railway account token and Kinsta API key
- Configure Railway project webhook → `/api/railway/webhook?key=`

## Checklist

- [ ] Set `GITHUB_TOKEN` and `RAILWAY_*` vars
- [ ] Set `KINSTA_*` if WordPress tools are needed
- [ ] Test `list_railway_variables` and `get_railway_status` agent tools
- [ ] Set `moduleStatus.dev_infra` → `deployed` in install config
