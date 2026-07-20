# Kinsta WordPress — admin agent tools

Use Kinsta tools for **WordPress sites hosted on Kinsta** (client/agency sites). **Reave itself runs on Railway** — do not use Kinsta tools for reave.app deploys, DNS on Railway, or Resend email DNS.

## Env (Reave Astro service on Railway)

| Variable | Purpose |
|----------|---------|
| `KINSTA_API_KEY` | Bearer token — MyKinsta → username → **Company settings → API keys** |
| `KINSTA_COMPANY_ID` | Company UUID — MyKinsta URL `?idCompany=…` or Billing details |
| `KINSTA_DRY_RUN` | Optional `1` — write tools return dry-run without calling Kinsta |

If either key or company id is missing, tools return an error. `run_dev_task` → `service_status` shows `kinsta: true/false`.

## When to use

- List client WordPress sites, live/staging environments, primary domains, PHP version
- Create new client sites (fresh WordPress or clone from a template environment)
- Manual backups before risky changes; list existing backups
- Delete decommissioned client sites (destructive — confirm first)
- Clear site cache after a WP deploy or global plugin change

## Tools

| Tool | Use |
|------|-----|
| `list_kinsta_sites` | All sites; set `include_environments: true` (default) for env ids + domains. Optional `site_id` for one site. |
| `create_kinsta_site` | New site (`install_mode: new` + admin creds) or clone (`install_mode: clone` + `source_env_id`). Returns `operation_id`. |
| `delete_kinsta_site` | Permanent site deletion. First call without `confirmed:true` returns site details + warning; re-call with `confirmed:true` after user OK. |
| `backup_kinsta_site` | Manual backup for an `environment_id`; optional `tag`. Returns `operation_id`. |
| `list_kinsta_backups` | List manual, scheduled, and system backups for an environment. |
| `clear_kinsta_cache` | Requires `environment_id` from list — returns `operation_id` |
| `get_kinsta_operation` | Poll until `has_completed` or `has_failed` |
| `run_dev_task` | `ping_kinsta` (connectivity + site count), `list_kinsta_sites` (raw JSON) |

## Typical flows

### Cache clear

1. `list_kinsta_sites` — find site by name; note **live** `environment_id`
2. `clear_kinsta_cache` with that id
3. `get_kinsta_operation` — retry until complete

### New client site

1. Collect display name, region (default `us-central1`), WP admin email/user/password
2. `create_kinsta_site` — poll `get_kinsta_operation` (1–3 min)
3. `list_kinsta_sites` — confirm site + live environment id and domain

### Backup before change

1. `list_kinsta_sites` — get live `environment_id`
2. `backup_kinsta_site` with optional tag (e.g. `pre-plugin-update`)
3. Poll operation, then `list_kinsta_backups` to verify

### Delete site

1. `list_kinsta_sites` — confirm correct `site_id`
2. `delete_kinsta_site` with `site_id` only — tool returns blocked + site summary
3. Warn user; after explicit confirmation, `delete_kinsta_site` with `confirmed: true`
4. Poll `get_kinsta_operation`

## API notes

- Base URL: `https://api.kinsta.com/v2`
- Long-running actions return `operation_id` — always poll `/operations/{id}` (site create may 404 for a few seconds before the operation registers)
- Rate limits: ~120 req/min per company
- Token scope depends on MyKinsta role (owner/admin vs developer)

## Not in agent tools yet

PHP version changes, backup restore, SSL cert management, staging clone/push, and DNS are on the Kinsta API but not exposed as Reave agent tools. Use MyKinsta or extend `kinstaClient.ts`.
