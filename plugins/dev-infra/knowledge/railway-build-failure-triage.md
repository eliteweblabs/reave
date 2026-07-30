# Railway build failure triage — agent playbook

When a deploy failure alert fires (webhook or email), follow this playbook **in order**. Duplicate alerts for the same GitHub repo are blocked automatically — you hold the repo lock until you close the incident with a RESOLVED or UNRESOLVED marker.

## Service → repo mapping

| Railway project / service | GitHub repo | Health URL |
|---------------------------|-------------|------------|
| Reave App / astro (default) | `eliteweblabs/reave` | `https://reave.app/` |
| Reave App / materials-api | `eliteweblabs/materials-api` | `$MATERIALS_API_BASE_URL/health` |
| Reave App / fleet-api | `eliteweblabs/fleet-api` | `$FLEET_API_BASE_URL/health` |
| Reave App / contact-api | `eliteweblabs/contact-api` | `$CONTACT_API_BASE_URL/health` |
| Reave App / crater | `eliteweblabs/crater-invoicing` | `https://ap.reave.app/` |
| Paulino Wizard project | `eliteweblabs/paulino-wizard` | `$PAULINO_WIZARD_API_BASE_URL` |

Always pass `repo` (and `health_url` when known) to `check_deployment_status` and `get_git_status`.

## Step 1 — Status check (always first)

```
check_deployment_status(repo:"<owner/repo>", health_url:"<url>")
get_git_status(repo:"<owner/repo>")
get_recent_commits(repo:"<owner/repo>", with_files:true, limit:3)
```

## Step 2 — Classify

### A. Rollout teardown (false alarm)

Signals:
- Railway email says "Deployment crashed" but health is **200**
- Deployed SHA **matches** latest GitHub commit
- Site is reachable

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
1. Read startup code, recent commit diff
2. Check for missing env vars (you cannot set Railway vars — tell owner exactly which var)
3. Fix code if possible via `write_github_file`
4. If not code-fixable → **`🚨 UNRESOLVED`**

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

- Fetch Railway build logs via API — infer from GitHub commits + health ping
- Set Railway environment variables — document what's missing
- Run parallel repairs for the same repo — blocked by incident lock

## Multi-location note

Each Railway project should have its webhook pointed at `/api/railway/webhook?key=…`. Email notifications are optional; duplicates are auto-suppressed when the repo lock is held.
