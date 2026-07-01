#!/bin/bash
# Auto commit + push when a Cursor agent turn finishes.
cat >/dev/null

root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$root" || exit 0

git add -A
git diff --cached --quiet && exit 0

msg="wip: agent $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git commit -m "$msg" || exit 0
git push || exit 0

exit 0
