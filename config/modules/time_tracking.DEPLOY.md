---
feature: time_tracking
defaultStatus: pending
stage: 2
---

# Time tracking deployment

## Sibling services

- None

## Required env vars

- None beyond core Reave (`DATABASE_URL` for time log storage)

## External setup

- Enable `time_tracking` in install config `features[]`
- Hours and notes on work items feed into invoicing suggestions

## Checklist

- [ ] Enable `time_tracking` in install config
- [ ] Log time on a test work item
- [ ] Verify hours appear in invoice suggestions
- [ ] Set `moduleStatus.time_tracking` → `deployed` in install config
