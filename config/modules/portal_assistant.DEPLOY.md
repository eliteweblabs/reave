---
feature: portal_assistant
defaultStatus: deployed
stage: 2
---

# Portal assistant deployment

## Sibling services

- None — Claude-powered help chat on client portal pages and the public site (`/api/site/assistant`)

## Required env vars

- `ANTHROPIC_API_KEY` — powers the speed-dial support assistant

## External setup

- Enable `portal_assistant` in install config `features[]` (requires `client_portal` for portal pages; site chat only needs the flag + API key)
- Assistant appears as a help button on `/c/:uid` pages
- Public site: MarketingLayout FAB, or service landings with a footer dock that opens the same sheet

## Checklist

- [ ] Confirm `client_portal` is enabled (for portal pages)
- [ ] Set `ANTHROPIC_API_KEY` on Astro service
- [ ] Enable `portal_assistant` in install config
- [ ] Test help chat from a client portal on mobile
- [ ] On service landings, confirm footer dock opens the sheet and replies
- [ ] Set `moduleStatus.portal_assistant` → `deployed` in install config
