---
feature: portal_assistant
defaultStatus: pending
stage: 2
---

# Portal assistant deployment

## Sibling services

- None — Claude-powered help chat on client portal pages

## Required env vars

- `ANTHROPIC_API_KEY` — powers the speed-dial support assistant

## External setup

- Enable `portal_assistant` in install config `features[]` (requires `client_portal`)
- Assistant appears as a help button on `/c/:uid` pages

## Checklist

- [ ] Confirm `client_portal` is enabled
- [ ] Set `ANTHROPIC_API_KEY` on Astro service
- [ ] Enable `portal_assistant` in install config
- [ ] Test help chat from a client portal on mobile
- [ ] Set `moduleStatus.portal_assistant` → `deployed` in install config
