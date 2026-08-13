---
feature: online_reviews
defaultStatus: deployed
stage: 3
---

# Reviews triage deployment

## Sibling services

- None — Google Places API for review sync

## Required env vars

- `GOOGLE_MAPS_API_KEY` — Places API for Google review sync (alias: `GOOGLE_PLACES_API_KEY`)

## External setup

- Enable `online_reviews` in install config `features[]`
- Add `reviews` to `footerNav` if not present
- Configure Google Place ID in Reviews settings or Admin → Socials

## Checklist

- [ ] Set `GOOGLE_MAPS_API_KEY` on Astro service
- [ ] Configure Place ID and run `sync_google_reviews`
- [ ] Verify triage workflow in Reviews tab
- [ ] Set `moduleStatus.online_reviews` → `deployed` in install config
