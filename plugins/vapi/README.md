# Vapi plugin (upsell)

Optional add-on for Reave — **not included in the default install**. Customers enable it when they purchase homepage voice / Vapi assistant branding.

## What it provides

- Admin → **Vapi** settings (assistant ID, first message, system prompt)
- Build-time + manual assistant sync from Company details
- Agent tool: `sync_vapi_assistant` and slash command `/vapi-sync`
- Optional **Live Speak Agent Widget** when `homepageVoice: true` in install config

Separate from the **`voice`** feature (Telnyx inbound phone agent).

## Enable on an install

1. Add `"vapi"` to `features` in `config/config-{slug}.json`
2. Add `"vapi"` to `profileMenu` if the settings tab should appear
3. Set `"homepageVoice": true` only when the customer wants the public site widget
4. On Railway (build + runtime service):
   - `VAPI_API_KEY` — private key (build sync + admin API)
   - `PUBLIC_VAPI_PUBLIC_KEY` — client SDK key
   - `PUBLIC_VAPI_ASSISTANT_ID` — assistant UUID (or set in Admin → Vapi)
5. Redeploy

To skip build-time sync during development: `VAPI_SYNC_SKIP=1`.

## Default installs

`config-default.json`, demo, and production reave.app ship **without** `vapi` in `features`. No Vapi env vars are required unless the add-on is sold.

## External plugin repo (target architecture)

Today this folder lives in the Reave monorepo for convenience. The long-term plan is a **separate git repo** published as an npm package or submodule:

```
@reave/plugin-vapi/
├── manifest.ts
├── agentTools.ts
├── knowledge/vapi-setup.md
├── lib/              # sync client, env helpers (moved from src/lib/vapi*.ts)
├── routes/           # /api/admin/vapi (moved from src/pages/api/admin/vapi.ts)
├── components/       # VoiceChatButton (moved from src/components/)
└── package.json      # depends on @vapi-ai/web
```

Reave core would:

- Register the manifest only when the package is installed
- Expose a plugin hook for optional prebuild steps (replacing hard-coded `prebuild` in root `package.json`)
- Keep generic `company_config` columns or move plugin fields to plugin-owned storage

Until that extraction lands, core still contains legacy wiring (`VoiceChatButton.astro`, `scripts/sync-vapi-assistant.ts`, admin map Vapi tab). All of it is **gated off** unless `"vapi"` is in install config features.

## OS map

When disabled, the System map shows the Vapi node as ghost/disabled. Re-enable the node when the plugin is sold and configured.
