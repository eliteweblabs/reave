# Kinsta WordPress — admin agent tools

Use Kinsta tools for **WordPress sites hosted on Kinsta** (client/agency sites). **Reave itself runs on Railway** — do not use Kinsta tools for reave.app deploys, DNS on Railway, or Resend email DNS.

## Env (Reave Astro service on Railway)

| Variable | Purpose |
|----------|---------|
| `KINSTA_API_KEY` | Bearer token — MyKinsta → username → **Company settings → API keys** |
| `KINSTA_COMPANY_ID` | Company UUID — MyKinsta URL `?idCompany=…` or Billing details |
| `KINSTA_DRY_RUN` | Optional `1` — `clear_kinsta_cache` returns dry-run without calling Kinsta |

If either key or company id is missing, tools return an error. `run_dev_task` → `service_status` shows `kinsta: true/false`.

## When to use

- List client WordPress sites, live/staging environments, primary domains, PHP version
- Clear site cache after a WP deploy or global plugin change
- Look up `environment_id` before cache/backup operations

## Tools

| Tool | Use |
|------|-----|
| `list_kinsta_sites` | All sites; set `include_environments: true` (default) for env ids + domains. Optional `site_id` for one site. |
| `clear_kinsta_cache` | Requires `environment_id` from list — returns `operation_id` |
| `get_kinsta_operation` | Poll until `has_completed` or `has_failed` |
| `run_dev_task` | `ping_kinsta` (connectivity + site count), `list_kinsta_sites` (raw JSON) |

## Typical cache-clear flow

1. `list_kinsta_sites` — find site by name; note **live** `environment_id`
2. `clear_kinsta_cache` with that id
3. `get_kinsta_operation` — retry until complete (ops can take a few seconds)

## API notes

- Base URL: `https://api.kinsta.com/v2`
- Long-running actions return `operation_id` — always poll `/operations/{id}`
- Rate limits: ~120 req/min per company; cache clears are async, not instant
- Token scope depends on MyKinsta role (owner/admin vs developer)

## Not in agent tools yet

Site create, clone, backup restore, PHP version changes, and DNS are available on the Kinsta API but not exposed as Reave agent tools unless added later. For those, use MyKinsta or extend `kinstaClient.ts`.
