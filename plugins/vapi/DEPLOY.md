---
feature: vapi
defaultStatus: request
stage: 3
---

# Vapi assistant deployment

## Sibling services

- None — Vapi cloud hosts the assistant

## Required env vars

- `VAPI_API_KEY` — private key for build sync and admin API
- `PUBLIC_VAPI_PUBLIC_KEY` — client SDK key (browser-safe)
- `PUBLIC_VAPI_ASSISTANT_ID` — assistant UUID (or set in Admin → Vapi)

## External setup

- Enable `vapi` in install config `features[]`
- Add `"vapi"` to `profileMenu` for settings tab
- Set `"homepageVoice": true` only when the public widget is sold
- Create assistant in Vapi dashboard; allow production origin

## Checklist

- [ ] Set `VAPI_*` and `PUBLIC_VAPI_*` on Astro service
- [ ] Redeploy (prebuild runs `sync:vapi`)
- [ ] Verify Admin → Vapi settings and optional homepage widget
- [ ] Set `moduleStatus.vapi` → `deployed` in install config
