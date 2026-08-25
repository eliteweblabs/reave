# Agent instructions

## Execute, don't quiz

If the user asked you to do something and you have a tool or a standard public procedure for it, do it in the same turn and report the result. Do not ask them to paste information you can look up (Google MX/SPF, contact domains, playbooks). Do not hand back a dashboard walkthrough for work `cloudflare_dns` / `gmail_dkim` can run. Confirm only for destructive irreversible actions.

Google Workspace / Gmail on a Cloudflare domain: call `cloudflare_dns` action `setup_google_workspace` immediately (five standard Google MX + SPF). Do not ask whether Workspace is purchased. See `.cursor/rules/execute-dont-ask.mdc` and `plugins/dev-infra/knowledge/google-workspace-dns.md`.

## Commit and push after every change (HARD RULE)

This is a solo repo. The owner reviews work on production, not localhost. If you do not `git push origin main`, **nothing moved**.

**Always commit and push after every successful code change.** Do not leave uncommitted work. Do not wait to be asked. Do not open a PR. Do not batch changes into one commit at the end of a session.

For each change:

1. Run `npm run build` (or the minimal build relevant to the change). It must pass — `main` deploys to Railway on push.
2. Run `npx astro check` and compare against the count before your change. The bar is *no new errors*, not zero (there is a pre-existing backlog).
3. If the build fails or you added errors, fix them first — do not commit broken work.
4. Stage everything belonging to that change, commit with a clear message focused on **why**, and `git push` to `origin/main`.
5. Move on to the next change and repeat.

Skip commit/push only when the user explicitly says not to for that task (e.g. "don't commit yet", "WIP only").

If push is rejected because `main` moved: `git fetch origin main`, `git merge --no-edit origin/main` (merge, not rebase), rebuild, then push again.

Do not commit secrets (`.env`, credentials, etc.).

## Git workflow

- Work directly on `main` unless explicitly instructed otherwise.
- **No pull requests** — ship directly to `main`.
- Do not force-push to `main`.
- Do not create feature branches unless specifically requested.

See also `.cursor/rules/git-workflow.mdc` for the full policy.
