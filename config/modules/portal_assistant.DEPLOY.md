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

- Enable `portal_assistant` in install config `features[]`
- Portal: help FAB on `/c/:uid`
- Public site: MarketingLayout FAB, or service landings with a footer dock → same iOS sheet
- Per-landing options in `config/sites/*-config.json` → `landing.chat`:
  - `introPhrases[]` — random owner intro bubble
  - `avatarSrc` / `avatarAlt` — sheet + bubble icon
  - `dockPlaceholder` / `inputPlaceholder`
  - `headerTitle` / `headerSubtitle` / `footerPrefix`
  - `hideFab` — footer dock instead of FAB (default on service landings)
  - `engagement` — `{ mode: "scroll"|"immediate"|"none", minScrollPx, delayMs, settleMs }`

## Checklist

- [ ] Set `ANTHROPIC_API_KEY` on Astro service
- [ ] Enable `portal_assistant` in install config
- [ ] Test help chat from a client portal on mobile
- [ ] On service landings, confirm footer dock opens the sheet and replies
- [ ] Tune `landing.chat` phrases / avatar / engagement as needed
- [ ] Set `moduleStatus.portal_assistant` → `deployed` in install config
