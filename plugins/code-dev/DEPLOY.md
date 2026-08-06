---
feature: code_dev
defaultStatus: deployed
stage: 3
---

# Code dev tools deployment

## Sibling services

- None

## Required env vars

- None — local dev only; never enable on production client installs

## External setup

- Enable `code_dev` only in `config/config-reave.json` (Reave install)
- Grants agent `read_file`, `write_file`, `list_files`, `exec_command` on the repo

## Checklist

- [ ] Confirm install is Reave internal (not a client deployment)
- [ ] Add `code_dev` to install config `features[]`
- [ ] Verify agent can read/write files locally
- [ ] Set `moduleStatus.code_dev` → `deployed` in install config
