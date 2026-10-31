---
feature: ideogram
defaultStatus: deployed
stage: 2
---

# Ideogram AI image generation deployment

## Sibling services

- None — calls api.ideogram.ai from the Reave App service

## Required env vars

- `IDEOGRAM_API_KEY` — server-only key from https://ideogram.ai/platform
- `IDEOGRAM_MODEL` — optional model slug (default `ideogram-3`)

## External setup

- Enable `ideogram` in install config `features[]` (or enable `website`, which bundles image tools)
- Create an API key in the Ideogram platform dashboard
- Add credits / billing on the Ideogram account (requests fail with 402 when balance is zero)

## Checklist

- [ ] Add `ideogram` to install `features[]`
- [ ] Set `IDEOGRAM_API_KEY` on the Reave App Railway service
- [ ] Ask the agent to generate a test image (uses `generate_image`)
- [ ] Set `moduleStatus.ideogram` → `deployed` in install config
