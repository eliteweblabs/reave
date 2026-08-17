---
feature: dev_infra
defaultStatus: deployed
stage: 3
---

# Dev & infrastructure deployment

**Visibility:** private / owner-only (not sold as an add-on). Git publish lives on `content_management` (Agentic Website Editor). This pack is Railway + Kinsta + deploy repair for the deployment owner.

## Sibling services

- None — agent tools call Railway and Kinsta APIs directly

## Required env vars

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

- [ ] Set `RAILWAY_*` vars (Git publish is `content_management` + `GITHUB_TOKEN`)
- [ ] Set `KINSTA_*` if WordPress tools are needed
- [ ] Test `list_railway_variables` and `get_railway_status` agent tools
- [ ] Set `moduleStatus.dev_infra` → `deployed` in install config
