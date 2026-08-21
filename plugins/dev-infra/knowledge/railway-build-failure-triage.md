# Railway build failure triage — agent playbook

When a deploy failure alert fires (webhook or email), follow this playbook **in order**. The app opens **one repair Session per Railway service** and appends later crashes there — do not start a new Session, and do not treat a follow-up as a first look. Read prior turns in this chat (and Recent Sessions) before you act. Duplicate alerts for the same GitHub repo are also blocked when the incident lock is on — you hold that lock until you close with a RESOLVED or UNRESOLVED marker.

## Service → repo mapping

| Railway project / service | GitHub repo | Health URL |
|---------------------------|-------------|------------|
| Reave App / astro (default) | `eliteweblabs/reave` | `https://reave.app/` |
| Reave App / materials-api | `eliteweblabs/materials-api` | `$MATERIALS_API_BASE_URL/health` |
| Reave App / fleet-api | `eliteweblabs/fleet-api` | `$FLEET_API_BASE_URL/health` |
| Reave App / contact-api | `eliteweblabs/contact-api` | `$CONTACT_API_BASE_URL/health` |
| Reave App / crater | `eliteweblabs/crater` | `https://ap.reave.app/` |
| Paulino Wizard project | `eliteweblabs/paulino-wizard` | `$PAULINO_WIZARD_API_BASE_URL` |

Always pass `repo` (and `health_url` when known) to `check_deployment_status` and `get_git_status`. Use `get_railway_status`, `list_railway_deployments`, and `get_railway_logs` for Railway-side detail (see read_knowledge slug `railway-agent-tools`).

## Step 1 — Status check (always first)

```
check_deployment_status(repo:"<owner/repo>", health_url:"<url>")
get_git_status(repo:"<owner/repo>")
get_recent_commits(repo:"<owner/repo>", with_files:true, limit:3)
get_railway_status()
list_railway_deployments(service:"<service>", limit:3)
get_railway_logs(service:"<service>", types:["build","deploy"], limit:80)
```

## Step 2 — Classify

### A. Rollout teardown (false alarm)

Signals:
- Railway email says "Deployment crashed" but health is **200**
- Deployed SHA **matches** latest GitHub commit
- Website is reachable

Action: Reply with **`✅ RESOLVED — rollout teardown`** and stop. No fix needed.

### B. Build failure (commit never went live)

Signals:
- Deployed SHA is **behind** latest commit
- Health may still be 200 (old code still running)

Action:
1. Read files changed in the failing commit (`get_recent_commits` with_files)
2. Look for TypeScript errors, missing imports, bad env references
3. Fix via `write_github_file(branch:"main")` — one commit per logical fix
4. Report the commit SHA/URL in your reply

### C. Runtime crash (deploy succeeded then died)

Signals:
- Deployed SHA **is** latest commit
- Health check **fails** (unreachable or 5xx)

Action:
1. `get_railway_logs` for the failing service (build + deploy streams)
2. Read startup code, recent commit diff
3. `list_railway_variables` — if a required var is missing and the owner approves, `set_railway_variables`
4. Fix code if possible via `write_github_file`
5. If not fixable → **`🚨 UNRESOLVED`**

### D. Not auto-fixable

Examples: missing Railway secret, external API down, manual dashboard config, database migration needs human approval.

Action: **`🚨 UNRESOLVED — <exact steps for owner>`**

## Step 3 — Fix (when applicable)

- **Never open a PR** — commit straight to `main` with `write_github_file`
- Read the file before writing
- One focused commit per fix
- Report commit SHA: `Fix commit: https://github.com/owner/repo/commit/<sha>`

## Step 4 — Close the incident (mandatory)

End **every** deploy-failure reply with exactly one of these lines:

```
✅ RESOLVED — rollout teardown
✅ RESOLVED — fix committed (<short sha>)
✅ RESOLVED — already live, no action needed
🚨 UNRESOLVED — <what you tried + what owner must do>
```

The system uses these markers to:
- Delete the inbox email (on RESOLVED)
- Release the repo lock (so new alerts can fire if needed)
- Push to phone only on UNRESOLVED

## What you cannot do

- Open a second repair Session for the same service — the app reuses the existing one
- Run parallel repairs for the same repo — blocked by incident lock when enabled
- Delete Railway projects/services via API (not exposed in agent tools)

## Multi-location note

Each Railway project should have its webhook pointed at `/api/railway/webhook?key=…`. Email notifications are optional; duplicates are auto-suppressed when the repo lock is held.
