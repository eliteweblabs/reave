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
3. **Commit and push after every change** — no PRs required for this workflow; keep the repo updated (`git add` / `git commit` / `git push`).
4. **Chat UI work** — find where messages are rendered, add markdown link parsing/sanitization, test in the browser.
5. **Focused commits** — one feature per commit with a clear message.

## Start here

1. `list_files` on `.` or `src` to orient.
2. Find the chat UI component (message rendering).
3. Make the change with `read_file` → `write_file`.
4. `exec_command` to verify, then commit and push.

## Related (global / GitHub API)

For remote-only edits without a local checkout, see `github-dev-tools` (`create_github_branch` → `write_github_file` → `create_pull_request`). On the live Railway container, filesystem edits persist until the next deploy — always commit and push so the next deploy includes them.
