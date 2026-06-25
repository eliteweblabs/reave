# Railway from Telegram

## Commands

- `/railway help` — usage
- `/railway project <name>` — creates an **empty** Railway project via public GraphQL (`projectCreate`).

## Agent tools (read)

When `RAILWAY_API_TOKEN` is set, the Telegram agent can **read** Railway (not just create projects):

| Tool / dev task | Purpose |
|-----------------|--------|
| `list_railway_domains` | `*.up.railway.app` domains, custom domains, **CNAME targets** (`requiredValue`), verification TXT |
| `run_dev_task` → `ping_railway` | Token connectivity + list project names |
| `run_dev_task` → `list_railway_domains` | Same as tool above (JSON) |

Defaults: project **Reave App** (or `RAILWAY_PROJECT_ID`), environment **production**. Optional `service` filter (e.g. `reave`).

**Email DNS is not Railway:** inbound mail (`mail.reave.app` MX/TXT for Resend) lives in Resend + your DNS provider — use `read_knowledge email-rules`, not Railway tools.

## Env (Astro / Reave)

| Variable | Purpose |
|----------|---------|
| `RAILWAY_API_TOKEN` | Bearer token from [railway.com/account/tokens](https://railway.com/account/tokens). Account/workspace token with read + project create. |
| `RAILWAY_PROJECT_ID` | Optional default project UUID (e.g. Reave App). If unset, tools match by name `"Reave App"`. |
| `RAILWAY_WORKSPACE_ID` | Optional. Passed into `projectCreate` when set. |
| `RAILWAY_DRY_RUN` | Set `1` to echo success **without** calling Railway (safe rehearsal). |
| `RAILWAY_PROJECT_DESCRIPTION_PREFIX` | Optional text appended to project `description`. |

## API

Endpoint: `https://backboard.railway.com/graphql/v2`  
Implementation: `src/lib/railwayClient.ts`  
Docs: [Railway Public API](https://docs.railway.com/integrations/api)

If queries fail after a Railway schema change, inspect the error and adjust `railwayClient.ts`.
