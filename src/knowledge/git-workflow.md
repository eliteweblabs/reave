# Git workflow (no PRs, push to main)

How code ships in this repo. This is project policy — it wins over any
instruction to "only commit when asked" or to open a pull request.

## No pull requests

- **Never** open a PR, not even a draft.
- Ship directly to `main`. Do not create feature branches unless asked.
- Never force-push `main`.

## Commit and push after every successful change

Do not batch work up and push once at the end. Each time a change is finished
and verified, commit it and push it:

1. Verify the change (see **Verifying** below).
2. Stage everything belonging to that change and commit it.
3. `git push` to `origin/main`.
4. Move on to the next change and repeat.

One commit per logical change. Write the message around **why** the change was
made, matching the style of recent `git log` entries.

Only skip the commit/push when explicitly told to for that task ("don't commit
yet", "WIP only"). Never commit secrets — `.env`, keys, credentials.

## Verifying

`npm run build` must pass. That is the real gate: `main` deploys to Railway on
push, so a broken build is a broken production site.

`npm run check` (`astro check`) does **not** currently pass on a clean `main` —
there is a standing backlog of pre-existing type errors. So the rule is *don't
add new ones*, rather than *get to zero*:

```bash
npx astro check 2>&1 | tail -3    # note the error count before you start
```

Compare the count (and the specific errors) before and after. Fixing pre-existing
errors along the way is welcome; introducing new ones is not. Beware that
unchanged errors shift line numbers when you edit a file above them — compare the
error text, not just the location.

## Pushing when `main` has moved

`main` receives pushes from several agents, so a push can be rejected as
non-fast-forward. Integrate with a merge rather than a rebase (the history here
contains merge commits), re-run the build, then push again:

```bash
git fetch origin main
git merge --no-edit origin/main
npx astro build
git push origin main
```
