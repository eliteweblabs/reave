# GitHub — commit files straight to main from Admin Agent

The Agentic Website Editor writes files via the GitHub REST API. Read-only status tools (`get_git_status`, `get_recent_commits`, etc.) work with a read token; writes need extra scopes.

> **This project never uses pull requests.** Always commit directly to `main` with `write_github_file` (branch `main`). Do **not** call `create_github_branch` or `create_pull_request` unless the user explicitly asks for a branch or PR. Committing to `main` publishes through whatever host deploys the **website** repo.

## Two kinds of install

| Install | What you may edit |
|---------|-------------------|
| **Client** (`website` / `content_management`, not ops) | Only `websiteRepo` / `GITHUB_WEBSITE_REPO` (usually `eliteweblabs/{slug}-site`). Tools ignore other `repo` arguments. No `create_github_repo`. |
| **Ops / official reΛVe.app** | This app (`eliteweblabs/reave`) plus named sibling services. You provision each client’s front-end repo. |

Client installs do **not** get a PAT. GitHub cannot create PATs via API. The deploy wizard creates a **restricted GitHub App** for `eliteweblabs/{slug}-site` (`GITHUB_APP_ID` / `GITHUB_APP_INSTALLATION_ID` / `GITHUB_APP_PRIVATE_KEY`) and mints a 1-hour Contents token scoped to that repo on each write. Do not copy the official reΛVe.app `GITHUB_TOKEN` onto a client.

On a deployed container there is often no git binary and no `.git` checkout, so `exec_command`/shell `git push` will not work — the GitHub API is the only way to persist code there.

## Repo & env

| Variable | Purpose |
|----------|---------|
| `GITHUB_APP_ID` / `GITHUB_APP_INSTALLATION_ID` / `GITHUB_APP_PRIVATE_KEY` | Client website editor — mint a Contents token for `GITHUB_WEBSITE_REPO` only |
| `GITHUB_WEBSITE_REPO` | `owner/repo` for this install’s front-end (overrides `websiteRepo` in install config) |
| `GITHUB_TOKEN` | Ops / official reΛVe.app PAT. Optional on clients. Never copy this host token to a client. |
| `GITHUB_REPO` | App / Railway service repo (reΛVe.app). **Not** the client website target. |
| `websiteRepo` | Same as `GITHUB_WEBSITE_REPO`, in `config/config-{slug}.json` |

**GitHub App permissions (client website editor):** Contents read+write, Metadata read. Installation: selected repositories only — never `eliteweblabs/reave`.

**Host `GITHUB_TOKEN` (ops / wizard Apply):** classic PAT with `repo` scope so Apply can create `{slug}-site` and add it to the App. Do **not** put that PAT on a client install.

## Recommended workflow (commit straight to main)

1. **`read_github_file`** the page or config you will change.
2. **`write_github_file`** with `branch: "main"` in **this same turn** — clients never say “commit” or “publish.” Each call is one commit on `main`.
3. Report the **commit SHA** and **commit URL**. Do not claim success unless tools return OK.
4. **`undo_website_change`** when they say undo / change it back / never mind / put it back / I don’t like that.

### Branch/PR flow (ops, only when explicitly requested)

1. **`create_github_branch`** — new branch from `main`.
2. **`write_github_file`** — commit(s) on that branch.
3. **`create_pull_request`** — `head` = feature branch, `base` defaults to `main`.

## Provisioning a client website repo (ops)

Use the deploy wizard Apply (website / content_management on). It creates `eliteweblabs/{slug}-site`, then GitHub’s App manifest flow creates a restricted App installed on that repo only, and writes `GITHUB_APP_*` + `GITHUB_WEBSITE_REPO`. Host `GITHUB_TOKEN` must be a classic PAT with `repo` scope so Apply can create and attach the repo. Never install that App on `eliteweblabs/reave`.

## Tools

### `read_github_file`

Read a UTF-8 file. Required: `path`. Optional: `ref` (branch or SHA), `repo` (ops only).

### `undo_website_change`

Revert the latest commit on `main` (new commit, no history rewrite). No required params on a client install.

### `write_github_file`

Create or update a single file on an **existing branch**. Commits directly via the [Contents API](https://docs.github.com/en/rest/repos/contents).

| Param | Required | Notes |
|-------|----------|-------|
| `branch` | yes | Use `main` |
| `path` | yes | Repo-relative path |
| `content` | yes | Full new file text (UTF-8) |
| `message` | yes | Git commit message |
| `repo` | ops only | Ignored / rejected on client installs if it is not the website repo |

Returns: `commit_sha`, `commit_url`, file `sha`, `created` (true if new file).

**Does not:** delete files, or batch multiple paths in one call.

### `create_github_repo` (ops only)

Create a new GitHub repository under a user or org account.

| Param | Required | Notes |
|-------|----------|-------|
| `repo` | yes | `owner/name`, e.g. `eliteweblabs/tonybarlettajr-site` |
| `description` | no | Short repo description |
| `private` | no | Defaults to **true** |
| `auto_init` | no | Initialize with an empty README so a default branch exists (default **false**) |

**Tip:** If you need to commit files immediately after creation, pass `auto_init: true`.

## Example owner phrases

- “Change the homepage headline to …” → read, then `write_github_file` on `main` this turn
- “Undo that” / “I don’t like that” → `undo_website_change`
- “Make the about page shorter” → read, write, commit this turn (they will not say publish)
- Ops: “Create a website repo for …” → `create_github_repo` `eliteweblabs/{slug}-site`

## Limits & safety

- Path must not contain `..` (no directory traversal).
- Large files: GitHub Contents API is for normal source files, not binaries or huge blobs.
- Client tools refuse `eliteweblabs/reave` and any repo other than `websiteRepo`.
- If `GITHUB_TOKEN` is missing or read-only, tools return an error — tell the owner the agency needs to fix the token (do not ask them to create a PAT).
