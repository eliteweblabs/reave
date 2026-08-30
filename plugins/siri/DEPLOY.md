---
feature: siri
defaultStatus: deployed
stage: 2
---

# Siri Shortcuts deployment

## Sibling services

- None — Apple Shortcuts call the Astro install directly

## Required env vars

- `SIRI_API_KEY` — shared secret for the `X-Siri-Key` header (or use a Clerk session token)
- `AGENT_ALERT_USER_ID` — optional; required for audit / long agent-prompt completion push

## External setup

- Enable `siri` in install config `features[]`
- Generate a strong key (`openssl rand -base64 32`) and set `SIRI_API_KEY` on Railway
- On iPhone: Shortcuts → Get Contents of URL → `POST https://<host>/api/siri` with JSON body + `X-Siri-Key`
- Read knowledge slugs `siri-shortcuts`, `siri-quick-reference`, `siri-examples`
- **Cannot be tested in a demo environment** — needs Apple Shortcuts on a real device plus `SIRI_API_KEY` on a live install

## Checklist

- [ ] Set `SIRI_API_KEY` on the Astro service
- [ ] Create at least one Shortcut (e.g. list contacts or ask agent)
- [ ] Say the Siri phrase and confirm a spoken / shown reply
- [ ] Optional: async agent prompt + push when `AGENT_ALERT_USER_ID` + web push are set
- [ ] Set `moduleStatus.siri` → `deployed` in install config
