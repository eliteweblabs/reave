---
feature: social_inbox
defaultStatus: request
stage: 3
---

# Agentic Social Media deployment

Paid add-on. Clients buy it from admin → Modules (invoice) or call. Do **not**
enable from the client install — turn it on in `features[]` after payment.

## Sibling services

- None for the inbox shell. Live network APIs (Meta, LinkedIn, X, …) are
  optional later and need their own OAuth apps + review.

## Required env vars

- None to show the inbox. Google review rows reuse `online_reviews` +
  `GOOGLE_MAPS_API_KEY` when that module is also on.

## External setup

- Enable `social_inbox` in install config `features[]` after the sale
- Add `social` to `footerNav`
- Optional: profile links + OAuth under Admin → Socials

## Checklist

- [ ] Payment recorded (Modules purchase or invoice)
- [ ] Set `social_inbox` in `features[]`
- [ ] Add `social` to `footerNav` if missing
- [ ] Set `moduleStatus.social_inbox` → `deployed`
