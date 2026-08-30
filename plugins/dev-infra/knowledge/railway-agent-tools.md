# Railway agent tools — MCP parity

When `RAILWAY_API_TOKEN` is set on the Reave service, the admin agent has full Railway Public API access (GraphQL). **Never tell the owner to open the Railway dashboard for reads** — call the tool first.

## Required env

| Variable | Purpose |
|----------|---------|
| `RAILWAY_API_TOKEN` | Account/workspace token — read/write projects, services, variables, deployments, logs |
| `RAILWAY_PROJECT_ID` | Optional default project UUID (else match by install project name) |
| `RAILWAY_WORKSPACE_ID` | Optional — used when creating projects |

## Tool reference

| Tool | Use when |
|------|----------|
| `list_railway_projects` | List all projects the token can access |
| `list_railway_services` | Services + environments in a project |
| `list_railway_variables` | Read Variables tab (rendered values). Omit `service` for shared env vars. `names_only:true` for keys only |
| `set_railway_variables` | Set/update vars (`variables: {"KEY":"value"}`). `skip_deploys:true` to defer redeploy |
| `delete_railway_variable` | Remove one var by name |
| `list_railway_domains` | `*.up.railway.app`, custom domains, CNAME/TXT targets |
| `get_railway_service_config` | Start command, healthcheck, repo/image source |
| `get_railway_status` | Latest deployment status per service in an environment |
| `list_railway_deployments` | Recent deploy history; filter by `status` (FAILED, CRASHED, …) |
| `get_railway_logs` | Build / runtime / HTTP logs — pass `deployment_id` or `service` (latest deploy) |
| `redeploy_railway_service` | Trigger redeploy — requires `confirmed:true` after owner approval |
| `update_railway_service` | Change start command, healthcheck, root directory |
| `create_railway_project` | Empty project scaffold |
| `railway_whoami` / `list_railway_workspaces` | Token identity / workspace list |
| `search_railway_docs` | Quick docs.railway.com lookup |

Defaults: install project label (e.g. "reave.app App Demo") and `production` environment unless the user specifies otherwise.

## Common workflows

### Compare env vars between services

```
list_railway_variables { service: "reave" }
list_railway_variables { service: "contact-api" }
```

### Missing env var on deploy failure

1. `get_railway_logs { service: "reave", types: ["deploy","build"] }`
2. `list_railway_variables { service: "reave", names_only: true }`
3. If a var is missing and the owner approves: `set_railway_variables { service: "reave", variables: { "KEY": "value" } }`

### Custom domain / CNAME

```
list_railway_domains { service: "reave" }
```

Returns `requiredValue` for CNAME targets and `_railway-verify` TXT tokens.

## Security

- Variable values may contain secrets — **do not paste full values in chat** unless the owner explicitly asks.
- `redeploy_railway_service` and `set_railway_variables` (without `skip_deploys`) trigger deploys — confirm with the owner when ambiguous.

## Reference variables

Prefer Railway reference syntax over pasted URLs:

```
https://${{ contact-api.RAILWAY_PUBLIC_DOMAIN }}
```

Official docs: https://docs.railway.com/guides/variables#reference-variables
