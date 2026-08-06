---
feature: code_dev
defaultStatus: deployed
stage: 3
---

# Code dev tools deployment

## Sibling services

- None

## Required env vars

- None — optional module for installs where the agent should edit the repo and run shell commands locally

## External setup

- Add `code_dev` to install config `features[]` (Reave, web development agencies, and similar installs)
- Grants agent `read_file`, `write_file`, `list_files`, `exec_command` on the repo

## Checklist

- [ ] Add `code_dev` to install config `features[]`
- [ ] Verify agent can read/write files locally
- [ ] Set `moduleStatus.code_dev` → `deployed` in install config
