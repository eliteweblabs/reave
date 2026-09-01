---
feature: auto_email_response
defaultStatus: request
stage: 1
---

# Auto email response deployment

## Sibling services

- Resend outbound (same as core inbox replies)
- Core inbox triage (always on — this module adds draft + approve flow)

## Required env vars

- `RESEND_API_KEY` — outbound sends after owner approval
- `RESEND_FROM` — verified sender address

## Optional (not enabled in v1)

- `AUTO_EMAIL_REPLY_ENABLED` — reserved for a future opt-in auto-send path. **Leave unset.** All replies require hand review.

## External setup

- Enable `auto_email_response` in install config `features[]`
- Verify sending domain in Resend dashboard
- Owner reviews drafts in Email Lab / inbox before any reply goes out

## Checklist

- [ ] Set `RESEND_*` on Astro service
- [ ] Enable feature in `config/config-{slug}.json` `features[]`
- [ ] Confirm `moduleStatus.auto_email_response` → `deployed` after smoke test
- [ ] Do **not** set `AUTO_EMAIL_REPLY_ENABLED` until auto-send is productized
