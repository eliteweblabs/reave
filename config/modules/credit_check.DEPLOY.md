---
feature: credit_check
defaultStatus: request
stage: 3
---

# Credit check (reference)

Placeholder module — sales/ops reminder until someone asks for it. Not implemented; do not treat as live.

Contract: [eliteweblabs/Credit-Check-API](https://github.com/eliteweblabs/Credit-Check-API) (README only — `POST /api/credit-check`, `GET /api/credit-check/:id`). No bureau is wired.

## Sibling services

- **Credit-Check-API** — not built yet (vendor/API TBD)

## Required env vars

- TBD once a bureau or aggregator is chosen (likely `CREDIT_CHECK_API_BASE_URL` + `CREDIT_CHECK_API_KEY`)

## External setup

- Enable `credit_check` in install config `features[]` when ready to build
- Leave status at playbook `defaultStatus: request` until shipping (do not add moduleStatus on config-reave — that triggers the deploy banner)
- Add a dedicated footer tab only if/when a credit UI exists

## Scope to decide

- Bureau or auto-finance aggregator
- FCRA consent, permissible purpose, and adverse-action notices
- Applicant form + staff result view (SSN never in agent chat or logs)
- Soft vs hard pull
- Vertical if a client asks (dealership wizard / lending / rentals) — no committed first customer

## Checklist

- [ ] Product scope + vendor/API choice
- [ ] Implement sibling API and/or plugin
- [ ] Wire `hasFeature('credit_check')` gates
- [ ] Enable in install `features[]` when ready
- [ ] Set `moduleStatus.credit_check` → `deployed`
