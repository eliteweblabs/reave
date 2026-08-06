---
feature: site_audits
defaultStatus: deployed
stage: 2
---

# Website audits deployment

## Sibling services

- None

## Required env vars

- `GOOGLE_PAGESPEED_API_KEY` — Lighthouse / PageSpeed Insights API

## External setup

- Enable `site_audits` in install config `features[]`
- Create API key in Google Cloud Console (PageSpeed Insights API enabled)

## Checklist

- [ ] Set `GOOGLE_PAGESPEED_API_KEY` on Astro service
- [ ] Run a Lighthouse audit via agent or inquiry flow
- [ ] Confirm fallback works when quota is exceeded (`fetch_url` + manual notes)
- [ ] Set `moduleStatus.site_audits` → `deployed` in install config
