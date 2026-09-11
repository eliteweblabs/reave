# Luxe Cleaning deploy checklist

Formerly **Maid & Marble** — install slug `luxe-cleaning`.

## Railway (Astro service)

```bash
VAPI_API_KEY=… PUBLIC_VAPI_PUBLIC_KEY=… bash scripts/deploy-luxe-cleaning.sh
```

The deploy script **creates the Vapi assistant** when `PUBLIC_VAPI_ASSISTANT_ID` is empty, then writes the new id to Railway.

Or provision only:

```bash
INSTALL_CONFIG=luxe-cleaning VAPI_API_KEY=… npm run provision:vapi
```

Or set manually:

| Variable | Value |
|----------|--------|
| `INSTALL_CONFIG` | `luxe-cleaning` |
| `PUBLIC_SITE_DOMAIN` | production apex domain |
| `PUBLIC_INSTALL_HOMEPAGE_VOICE` | `1` |
| `COMPANY_NAME` | `Luxe Cleaning` |
| `VAPI_PHONE_NUMBER` | `+15089558850` |
| `VAPI_API_KEY` | private key |
| `PUBLIC_VAPI_PUBLIC_KEY` | browser SDK key |
| `PUBLIC_VAPI_ASSISTANT_ID` | assistant UUID |

Every deploy runs **prebuild** → `scripts/sync-vapi-assistant.ts`. On the first build with
`VAPI_API_KEY` set it **creates** the assistant, saves the id to `company_config`, syncs
prompts, and attaches `VAPI_PHONE_NUMBER`.

**Railway build service must have:**

| Variable | Required |
|----------|----------|
| `INSTALL_CONFIG` | `luxe-cleaning` |
| `VAPI_API_KEY` | yes — private key |
| `DATABASE_URL` | yes — so the new assistant id persists to Admin → Vapi |
| `VAPI_PHONE_NUMBER` | `+15089558850` |
| `PUBLIC_VAPI_PUBLIC_KEY` | yes — browser widget |
| `PUBLIC_VAPI_ASSISTANT_ID` | optional after first successful build |

Check build logs for `[vapi-sync] Created assistant …`. If you see `skipped`, the install
config slug or `VAPI_API_KEY` is missing on the **build** service (not just runtime).

## Vapi dashboard

1. Allow the production site origin on the public key.
2. Confirm **508-955-8850** appears under Phone Numbers.
3. After deploy, verify the number’s assistant matches `PUBLIC_VAPI_ASSISTANT_ID`.

## Verify

- Homepage shows **Luxe Cleaning** copy and **508-955-8850**.
- **Touch to speak** widget works on the deployed URL (not localhost).
- Inbound call to **508-955-8850** reaches the same assistant.
