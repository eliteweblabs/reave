---
feature: wayback_machine
defaultStatus: deployed
stage: 2
---

# Wayback Machine deployment

## Sibling services

- None (Internet Archive public read APIs)

## Required env vars

- None

## External setup

- Enable `wayback_machine` in install config `features[]`
- No Internet Archive account required for read-only snapshot lookup

## Checklist

- [ ] Add `wayback_machine` to install `features[]`
- [ ] Ask the agent: "What did our site look like in February 2018?" (uses company domain from branding when omitted)
- [ ] Confirm `wayback_list_snapshots` returns captures for a known archived domain
- [ ] Set `moduleStatus.wayback_machine` → `deployed` in install config
