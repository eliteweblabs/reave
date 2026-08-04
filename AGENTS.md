# Agent instructions

## Commit and push after every change

**Always commit and push after every successful code change.** Do not leave uncommitted work for the user. Do not batch changes into one commit at the end of a session.

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
