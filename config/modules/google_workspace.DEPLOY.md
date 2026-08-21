---
feature: google_workspace
defaultStatus: request
stage: 3
---

# Google™ Workspace (external service)

Catalog-only third-party service — not a REΛVE plugin. Use it for invoicing and owner bookkeeping. Do not treat it as an app module.

REΛVE setup is **$150** once. Google™ bills about **$8 per user per month** separately for branded email (`you@yourbusiness.com`).

## Why it is private

- Not a plug-in or runtime feature
- Must not appear on deploy, the demo builder, or the public add-ons page
- Do not enable in install `features[]` on current instances

## External setup

- Client pays Google™ ~$8/user/month
- Invoice REΛVE workspace setup at $150
- Domain, MX, SPF, DKIM, and user mailboxes are done in Google Admin — not in this app

## Checklist

- [ ] Confirm domain ownership
- [ ] Create Google™ Workspace account and first user
- [ ] Point MX / SPF / DKIM
- [ ] Invoice $150 setup (Google™ subscription billed by Google)
