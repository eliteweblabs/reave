---
feature: seo_directory
defaultStatus: development
stage: 2
---

# SEO Directory API Kit deployment

Second-tier citation & directory campaigns beyond the defaults (Google Business Profile, Apple Business Connect / Apple Maps, Yelp, Bing Places). Those four stay in audits, socials, and reviews — this module is the layer above them.

## Product decisions

- **Vendor:** BrightLocal (Citation Builder + Locations APIs) — one REΛVE agency account, not per-client accounts
- **Pricing model for clients:** one-time citation projects (ownership), not ongoing rental sync
- **Modes:** `local` | `national_ecommerce` (one module, two packages)
- **Directory scope:** configurable per-client checklist (not a hard-coded submit-everywhere list)
- **Surfaces (planned):** admin panel, agent tools, client portal visibility, feed into Maps & Directories audit scores

## Sibling services

- BrightLocal Management / Citation Builder APIs — https://developer.brightlocal.com
- Does **not** replace `site_audits` (discovery), `online_reviews`, or GBP/social fields

## Required env vars

- `BRIGHTLOCAL_API_KEY` — REΛVE agency API key (server-only; never `PUBLIC_`)

## External setup

1. Create / confirm REΛVE BrightLocal agency account with API + Citation Builder access
2. Add `BRIGHTLOCAL_API_KEY` on the Railway service (and local `.env` for dev)
3. Enable `seo_directory` in install config `features[]`
4. Set `moduleStatus.seo_directory` → `development` until Citation Builder create/track is live, then `deployed`

## Checklist

- [ ] Add `seo_directory` to install `features[]`
- [ ] Set `BRIGHTLOCAL_API_KEY` on the service
- [ ] Agent: `seo_directory_status` returns `configured: true`
- [ ] Locations API: create/list a test location under the agency account
- [ ] Citation Builder API: order + track a one-location campaign
- [ ] Per-client checklist stored and visible in admin
- [ ] Portal report surface for client-facing status
- [ ] Audit Maps & Directories score can consume kit coverage data
- [ ] Set `moduleStatus.seo_directory` → `deployed`
