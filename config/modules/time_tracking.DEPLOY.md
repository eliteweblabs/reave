---
feature: time_tracking
defaultStatus: deployed
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
- [ ] Start/stop a timer on a project Time tab
- [ ] Confirm hours appear in the log and invoice suggestions
- [ ] Optional: Siri “start time tracking” / “stop time tracking”
- [ ] Set `moduleStatus.time_tracking` → `deployed` in install config
