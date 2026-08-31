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
- Per-landing options in `config/sites/*-config.json` → `landing.chat` (see `src/lib/siteChat.ts`):
  - `enabled` — master switch (default true when module is on)
  - `introPhrases[]` — random owner intro bubble (first-message array)
  - `greeting` — sheet opening line when history is empty
  - `avatarSrc` / `avatarAlt` — sheet + bubble face/icon image
  - `iconKey` — optional IOS_ICONS key when no avatar image (reserved)
  - `dockPlaceholder` / `inputPlaceholder`
  - `headerTitle` / `headerSubtitle` / `footerPrefix`
  - `hideFab` — footer dock instead of FAB (default on service landings)
  - `revealFabOnEngagement` — when FAB is shown, delay reveal until engagement
  - `openOnFocus` — dock input focus opens the sheet (default true)
  - `dismissPersist` — `session` | `local` | `none` for intro dismiss
  - `dismissStorageKey` / `historyStorageKey`
  - `engagement` — `{ mode: "scroll"|"delay"|"immediate"|"none", minScrollPx, delayMs, settleMs }`
  - `businessNotes` — extra prompt context for `/api/site/assistant`

## Checklist

- [ ] Set `ANTHROPIC_API_KEY` on Astro service
- [ ] Enable `portal_assistant` in install config
- [ ] Test help chat from a client portal on mobile
- [ ] On service landings, confirm footer dock opens the sheet and replies
- [ ] Tune `landing.chat` phrases / avatar / engagement / businessNotes as needed
- [ ] Set `moduleStatus.portal_assistant` → `deployed` in install config
