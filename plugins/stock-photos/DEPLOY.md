---
feature: stock_photos
defaultStatus: deployed
stage: 2
---

# Pexels stock photos deployment

## Sibling services

- None — calls api.pexels.com from the Reave App service

## Required env vars

- `PEXELS_API_KEY` — server-only key from https://www.pexels.com/api/

## External setup

- Enable `stock_photos` in install config `features[]`
- Generate an API key at https://www.pexels.com/api/
- Attribution required: credit the photographer and link photos to their Pexels page
  (see https://www.pexels.com/api/documentation/#guidelines)

## Checklist

- [ ] Add `stock_photos` to install `features[]`
- [ ] Set `PEXELS_API_KEY` on the Reave App Railway service
- [ ] Ask the agent to find a stock photo (uses `search_stock_photos`)
- [ ] Confirm `GET /api/pexels/search?q=…` returns results when signed in
- [ ] Set `moduleStatus.stock_photos` → `deployed` in install config
