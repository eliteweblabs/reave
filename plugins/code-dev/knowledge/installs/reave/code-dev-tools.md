---
title: Code development tools (Reave only)
tags: [reave, code_dev, filesystem, shell]
---

# Code development tools — Reave install only

This playbook is **install-scoped** (`src/knowledge/installs/reave/`). Other white-label installs do not load it. Tools are gated by the `code_dev` feature in `config/config-reave.json`.

You can read, write, and execute code in this repository on the local filesystem.

## Tools

| Tool | Purpose |
|------|---------|
| `read_file` | Read a file (`path` relative to project root) |
| `write_file` | Create or overwrite a file (`path`, `content`) |
| `list_files` | List a directory (`path`; optional `recursive`) |
| `exec_command` | Run a shell command (`command`) — git, npm, node, etc. |

Paths are sandboxed to the project root. `.env*` writes are blocked. Prefer these over the read-only `run_terminal_command` sandbox when you need real edits or builds.

## Guidelines

1. **Read before write** — understand structure, then change. Propose first if uncertain.
2. **Test locally when possible** — run checks (`npm` scripts, typecheck) via `exec_command`; verify before claiming done.
3. **Commit straight to main after every change — NEVER open a pull request.** Keep the repo updated (`git add` / `git commit` / `git push` to `main`).
4. **Chat UI work** — find where messages are rendered, add markdown link parsing/sanitization, test in the browser.
5. **Focused commits** — one feature per commit with a clear message.

## Start here

1. `list_files` on `.` or `src` to orient.
2. Find the chat UI component (message rendering).
3. Make the change with `read_file` → `write_file`.
4. `exec_command` to verify, then commit and push.

## Environment matters: local checkout vs deployed Railway container

- **Local checkout (dev):** `exec_command` can run real git. Commit straight to `main` and push (`git add` / `git commit` / `git push`). No branches, no PRs.
- **Deployed Railway container:** there is **no git binary and no `.git` checkout** — `git` is not in the container PATH, so `exec_command` cannot commit or push. `write_file` edits only touch the ephemeral filesystem and are lost on the next deploy. To persist code changes from the deployed app you **must** use the GitHub REST API: `write_github_file` with `branch: "main"` (one commit per call, directly on `main` — never a branch or PR). Don't try `git push` and then "discover" git is missing; just use `write_github_file`.

## Related (global / GitHub API)

See `github-dev-tools` for the GitHub REST API tools. Default workflow everywhere: **commit straight to `main`** (`write_github_file` with `branch: "main"`). Committing to `main` triggers a Railway deploy automatically. Only use `create_github_branch` / `create_pull_request` if the user explicitly asks for a branch or PR.
