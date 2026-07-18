# GitHub — commit files & open PRs from Admin Agent

The Claude tool loop can **write files** and **open pull requests** on the Reave repo via the GitHub REST API. Read-only status tools (`get_git_status`, `get_recent_commits`, etc.) work with a read token; writes need extra scopes.

## Repo & env

| Variable | Purpose |
|----------|---------|
| `GITHUB_TOKEN` | PAT (or fine-grained token) on Railway — **required for writes** |
| `GITHUB_REPO` | Optional `owner/repo` override (default: `eliteweblabs/reave`) |

**Token permissions (fine-grained on `eliteweblabs/reave`):**

- Read status: **Contents** (read) + **Metadata**
- `write_github_file`: **Contents** (read + write)
- `create_pull_request`: **Pull requests** (read + write)

Classic PAT alternative: `repo` scope covers both.

## Recommended workflow

1. **`create_github_branch`** — new branch from `main` (or specify `from_branch`). Skip if the branch already exists.
2. **`write_github_file`** — one or more commits on that branch (each call = one commit).
3. **`create_pull_request`** — `head` = feature branch, `base` defaults to **`main`** if omitted.
4. Report **branch URL**, **commit URL**, and **PR link**. Do not claim success unless tools return OK.
5. Optional: **`get_git_status`** / **`get_recent_commits`** to verify; **`run_dev_task` task=service_status** shows `github_write.can_write_files` for token troubleshooting.

## Verify token permissions

Ask the bot: **"run a service status check"** (or `run_dev_task` → `service_status`). Look at `github_write`:

- `can_write_files: true` → `write_github_file` should work
- `can_write_files: false` → upgrade `GITHUB_TOKEN` on Railway (Contents write + Pull requests write on `eliteweblabs/reave`)

## Tools

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

- “Add a file `docs/notes.md` on branch `feature/docs-update` with …”
- “Update `src/lib/foo.ts` on `fix/typo` and open a PR into main”
- “Commit this change to GitHub and open a pull request”

## Limits & safety

- Path must not contain `..` (no directory traversal).
- Large files: GitHub Contents API is for normal source files, not binaries or huge blobs.
- Merging and deploying are **out of scope** — the bot opens the PR; a human (or CI) merges; Railway deploys from the default branch after merge.
- If `GITHUB_TOKEN` is missing or read-only, tools return an error — tell the owner to fix Railway Variables.
