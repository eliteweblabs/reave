---
feature: apple_business_connect
defaultStatus: request
stage: 3
---

# Apple Business Connect (external service)

Catalog-only third-party service — not a REΛVE plugin. Invoice and bookkeeping only. **No setup price yet** — verification is the hard part.

Does **not** require an Apple Developer Program account ($99/year, App Store). It needs a regular Apple ID and Apple’s business verification (EIN / D-U-N-S, domain TXT, or documents). That review is usually why a first pass stalls.

Do not enable in install `features[]`. Must not appear on deploy, the demo builder, or the public add-ons page.

## External setup

- Sign in at business.apple.com (Apple Business; formerly Business Connect) with a business Apple ID
- Complete two verification methods when asked
- Match name, address, hours, and category to the Google™ listing
- Photos and place card
