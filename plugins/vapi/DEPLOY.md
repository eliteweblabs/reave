---
feature: vapi
defaultStatus: request
stage: 3
---

# Vapi assistant deployment

## Sibling services

- None — Vapi cloud hosts the assistant

## Required env vars

- `INSTALL_CONFIG` — install slug with `vapi` in features (prebuild reads `config-{slug}.json`)
- `VAPI_API_KEY` — private key on **build + runtime** (prebuild creates/syncs assistant)
- `DATABASE_URL` — on build service so new assistant id saves to Admin → Vapi
- `PUBLIC_VAPI_PUBLIC_KEY` — client SDK key (browser-safe)
- `VAPI_PHONE_NUMBER` — optional E.164 inbound number (prebuild attaches to assistant)
- `PUBLIC_VAPI_ASSISTANT_ID` — optional after first build (or Admin → Vapi / Postgres)

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
