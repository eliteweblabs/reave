# GitHub — commit files straight to main from Admin Agent

The Agentic Website Editor writes files via the GitHub REST API. Read-only status tools (`get_git_status`, `get_recent_commits`, etc.) work with a read token; writes need extra scopes.

> **This project never uses pull requests.** Always commit directly to `main` with `write_github_file` (branch `main`). Do **not** call `create_github_branch` or `create_pull_request` unless the user explicitly asks for a branch or PR. Committing to `main` publishes through whatever host deploys this repo (Railway, or any git-connected host).
>
> On a deployed container there is often no git binary and no `.git` checkout, so `exec_command`/shell `git push` will not work — the GitHub API (`write_github_file`) is the only way to persist code there.

## Repo & env

| Variable | Purpose |
|----------|---------|
| `GITHUB_TOKEN` | PAT (or fine-grained token) — **required for writes** |
| `GITHUB_REPO` | Optional `owner/repo` override (default: `eliteweblabs/reave`) |

**Token permissions (fine-grained on the site repo):**

- Read status: **Contents** (read) + **Metadata**
- `write_github_file`: **Contents** (read + write)
- `create_pull_request` (only if a PR is ever explicitly requested): **Pull requests** (read + write)
- `create_github_repo`: **repo** scope (classic PAT) or **Administration** write on the org (fine-grained PAT)

Classic PAT alternative: `repo` scope covers both.

## Recommended workflow (commit straight to main)

1. **`write_github_file`** with `branch: "main"` — each call is one commit directly on `main`. Make one focused commit per logical change.
2. Report the **commit SHA** and **commit URL**. Do not claim success unless tools return OK.
3. Optional: **`get_git_status`** / **`get_recent_commits`** to verify.

Committing to `main` triggers the host that watches this repo — no merge or PR step.

### Branch/PR flow (only when explicitly requested)

Do not use this unless the user specifically asks for a branch or pull request:

1. **`create_github_branch`** — new branch from `main`.
2. **`write_github_file`** — commit(s) on that branch.
3. **`create_pull_request`** — `head` = feature branch, `base` defaults to `main`.

## Verify token permissions

Ask the bot: **"run a service status check"** (or `run_dev_task` → `service_status` when Dev & infrastructure is on). Look at `github_write`:

- `can_write_files: true` → `write_github_file` should work
- `can_write_files: false` → upgrade `GITHUB_TOKEN` (Contents write + Pull requests write on the site repo)

## Tools

### `create_github_repo`

Create a new GitHub repository under a user or org account.

| Param | Required | Notes |
|-------|----------|-------|
| `repo` | yes | `owner/name`, e.g. `eliteweblabs/my-client-site` |
| `description` | no | Short repo description |
| `private` | no | Defaults to **true** |
| `auto_init` | no | Initialize with an empty README so a default branch exists (default **false**) |

Returns: `repo`, `url`, `clone_url`, `private`, `created`.

**Tip:** If you need to commit files immediately after creation, pass `auto_init: true` (or create a branch with `create_github_branch` once the repo exists).

### `create_github_branch`

Create a branch pointing at the tip of an existing branch.

| Param | Required | Notes |
|-------|----------|-------|
| `branch` | yes | New branch name, e.g. `feature/fix-typo` |
| `from_branch` | no | Defaults to **`main`** |
| `repo` | no | Defaults to `GITHUB_REPO` / `eliteweblabs/reave` |

Returns: branch name, `sha`, `url` (tree link).

### `write_github_file`

Create or update a single file on an **existing branch**. Commits directly via the [Contents API](https://docs.github.com/en/rest/repos/contents).

| Param | Required | Notes |
|-------|----------|-------|
| `branch` | yes | Branch must already exist on GitHub |
| `path` | yes | Repo-relative path, e.g. `src/lib/example.ts` |
| `content` | yes | Full new file text (UTF-8) |
| `message` | yes | Git commit message |
| `repo` | no | Defaults to `GITHUB_REPO` / `eliteweblabs/reave` |

Returns: `commit_sha`, `commit_url`, file `sha`, `created` (true if new file).

**Does not:** delete files, or batch multiple paths in one call.

### `create_pull_request`

Open a PR after commits are on a feature branch.

| Param | Required | Notes |
|-------|----------|-------|
| `head` | yes | Branch with your changes |
| `base` | no | Target branch — defaults to **`main`** |
| `title` | yes | PR title |
| `body` | no | Markdown description |
| `repo` | no | Same default as above |

Returns: PR `number`, `url`, `state`, `head`, `base`.

## Example owner phrases

- “Create a new GitHub repo for …” → `create_github_repo` (use `auto_init: true` if you will `write_github_file` right away)
- “Add a file `docs/notes.md` with …” → `write_github_file` on `main`
- “Update `src/lib/foo.ts` and push it” → `write_github_file` on `main`
- “Commit this change to GitHub” → `write_github_file` on `main`

## Limits & safety

- Path must not contain `..` (no directory traversal).
- Large files: GitHub Contents API is for normal source files, not binaries or huge blobs.
- Default flow commits straight to `main`; the connected host deploys from `main`. Merging/PRs are only used if the user explicitly asks.
- If `GITHUB_TOKEN` is missing or read-only, tools return an error — tell the owner to fix the token on the host.
