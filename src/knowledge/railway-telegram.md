# Railway from Telegram (scaffold)

## Commands

- `/railway help` — usage
- `/railway project <name>` — creates an **empty** Railway project via public GraphQL (`projectCreate`).

## Env (Astro / Reave)

| Variable | Purpose |
|----------|---------|
| `RAILWAY_API_TOKEN` | Bearer token from [railway.com/account/tokens](https://railway.com/account/tokens). Must allow **project create** (account or workspace token — not a read-only project token). |
| `RAILWAY_WORKSPACE_ID` | Optional. If GraphQL rejects `name`-only creates, set to **Cmd+K → Copy Active Workspace ID** in Railway. Passed into `ProjectCreateInput` when set. |
| `RAILWAY_DRY_RUN` | Set `1` to echo success **without** calling Railway (safe rehearsal). |
| `RAILWAY_PROJECT_DESCRIPTION_PREFIX` | Optional text appended to project `description`. |

## API

Endpoint: `https://backboard.railway.com/graphql/v2`  
Docs: [Railway Public API](https://docs.railway.com/integrations/api)

If mutations fail after a Railway schema change, inspect the error text Telegram returns and adjust `src/lib/railwayClient.ts` (input shape / workspace field).
