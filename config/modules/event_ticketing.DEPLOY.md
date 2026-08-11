---
feature: event_ticketing
defaultStatus: request
stage: 3
---

# Event ticketing (reference)

Placeholder module — sales/ops reminder until productized. Not implemented; do not treat as live.

## Sibling services

- None yet (vendor/API TBD)

## Required env vars

- TBD once product scope and provider are chosen

## External setup

- Enable `event_ticketing` in install config `features[]` when ready to build
- Leave status at playbook `defaultStatus: request` until shipping (do not add moduleStatus on config-reave — that triggers the deploy banner)
- Add a dedicated footer tab only if/when a tickets UI exists

## Scope to decide

- Ticket sales / checkout
- QR or barcode check-in
- Event inventory and capacity
- Refunds / transfers
- Provider (custom vs Eventbrite / Ticketmaster / etc.)

## Checklist

- [ ] Product scope + vendor/API choice
- [ ] Implement plugin or core feature
- [ ] Wire `hasFeature('event_ticketing')` gates
- [ ] Enable in install `features[]` when ready
- [ ] Set `moduleStatus.event_ticketing` → `deployed`
