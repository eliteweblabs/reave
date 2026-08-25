---
feature: social_inbox
defaultStatus: request
stage: 3
---

# Agentic Social Media deployment

Paid add-on. Clients buy it from admin → Modules (invoice) or call. Do **not**
enable from the client install — turn it on in `features[]` after payment.

## Sibling services

- None for the inbox shell. Live network APIs need reΛVe.app-owned OAuth apps
  (one per network) plus App Review before clients besides testers can
  connect. Tokens stay on the client install after they click Connect.

## Required env vars

- None to show the inbox. Google review rows reuse `online_reviews` +
  `GOOGLE_MAPS_API_KEY` when that module is also on.
- Live Instagram Connect: `INSTAGRAM_APP_ID` + `INSTAGRAM_APP_SECRET`
  (Instagram App ID from Meta → Instagram → API setup with Instagram login,
  not the Meta App ID). Copied from the official host on deploy.

## External setup

- Enable `social_inbox` in install config `features[]` after the sale
- Add `social` to `footerNav`
- Optional: profile links + OAuth under Admin → Socials
- Instagram callback: `https://{domain}/api/admin/social/callback/instagram`
- Instagram deauthorize: `https://{domain}/api/admin/social/deauthorize/instagram`
- Instagram data deletion: `https://{domain}/api/admin/social/data-deletion/instagram`

## Checklist

- [ ] Payment recorded (Modules purchase or invoice)
- [ ] Set `social_inbox` in `features[]`
- [ ] Add `social` to `footerNav` if missing
- [ ] Set `moduleStatus.social_inbox` → `deployed`
