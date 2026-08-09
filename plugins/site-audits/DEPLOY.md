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

## Hosting IP lookup

`dns_check` traces A-record IPs to a hosting company (PTR + [ipwho.is](https://ipwho.is) ASN/org, plus NS/CNAME fingerprints). No API key required. Used to rate managed WordPress (Flywheel / Kinsta / WP Engine) vs budget shared hosts (GoDaddy / Bluehost) and flag server-resource bottlenecks.

## Checklist

- [ ] Set `GOOGLE_PAGESPEED_API_KEY` on Astro service
- [ ] Run a Lighthouse audit via agent or inquiry flow
- [ ] Confirm `seo_inventory` returns og:image / robots.txt / sitemap / manifest / favicon / JSON-LD checklist
- [ ] Confirm `dns_check` returns `hosting.company` + grade hint for a known domain
- [ ] Confirm fallback works when quota is exceeded (`fetch_url` + manual notes)
- [ ] Set `moduleStatus.site_audits` → `deployed` in install config
