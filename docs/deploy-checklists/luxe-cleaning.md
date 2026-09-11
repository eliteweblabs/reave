# Luxe Cleaning deploy checklist

Formerly **Maid & Marble** — install slug `luxe-cleaning`.

## Railway access (Cloud Agent — no MCP required)

### Cursor Mobile / Cloud Agent: Railway MCP toggle lies

On Cloud Agent runs (including Cursor Mobile), Railway MCP can show **toggle ON with no
status dot** while the runtime reports `namespaceStatus: "error"` and zero tools
(`failed during live tool discovery`). GitHub shows red on auth failure; Cloudflare
shows **Connect** when OAuth is needed. Railway fails **after** the session attaches
the server name but **before** live tool discovery completes — often because Cursor’s
backend OAuth proxy for `https://mcp.railway.com` cannot refresh or forward tokens on
headless Cloud Agent workers (no browser, no local `railway login`).

**Do not rely on Railway MCP from mobile Cloud Agents.** Use `RAILWAY_API_TOKEN` +
`npm run configure:luxe-cleaning-railway` instead (GraphQL — no MCP, no CLI).

Railway MCP often fails on Cloud Agents (OAuth/CLI not on the remote VM). Use a
**Railway account token** instead:

1. Create token at [railway.com/account/tokens](https://railway.com/account/tokens)
2. Add **`RAILWAY_API_TOKEN`** to Cursor → Cloud Agents → Environment → Secrets
3. Start a **new** Cloud Agent (running agents do not pick up new secrets)
4. Optionally add **`VAPI_API_KEY`** and **`PUBLIC_VAPI_PUBLIC_KEY`** to the same secrets

**Where the fleet Vapi private key lives on Railway:** **CAPCO Design Group** →
`capco` service (`VAPI_API_KEY` + `PUBLIC_VAPI_KEY`). Do **not** use the project
shared copy — it 401s. reave.app only has the public keys.

### Discover the client project

```bash
RAILWAY_API_TOKEN=… npm run configure:luxe-cleaning-railway -- --discover
```

Matches projects by name (Maid / Marble / Luxe) or custom domain
`maidandmarble.com` / `luxecleaning.com`. Excludes the official **reave.app**
project (`af65eb9a-b11c-4c1c-8030-66b4347dcf71`).

Document the discovered ids here after first run:

| Setting | Value |
|---------|--------|
| `LUXE_CLEANING_RAILWAY_PROJECT` | `1df6001c-be5a-4340-8a2a-097d22c7ebb2` (Maid & Marble) |
| `LUXE_CLEANING_RAILWAY_SERVICE` | `reave` (`f2f2bd9b-ae28-4b27-8fee-f2126450ffd4`) |
| `LUXE_CLEANING_RAILWAY_ENV` | `production` (`7c36f17d-f049-4cf4-b8cc-db6764f34ea8`) |

## Apply vars + redeploy (recommended)

```bash
RAILWAY_API_TOKEN=… \
VAPI_API_KEY=… \
PUBLIC_VAPI_PUBLIC_KEY=… \
npm run configure:luxe-cleaning-railway
```

Dry run:

```bash
RAILWAY_API_TOKEN=… npm run configure:luxe-cleaning-railway -- --dry-run
```

CLI fallback (local `railway login`):

```bash
LUXE_CLEANING_RAILWAY_PROJECT=<id> \
VAPI_API_KEY=… PUBLIC_VAPI_PUBLIC_KEY=… \
bash scripts/deploy-luxe-cleaning.sh
```

Or provision Vapi only:

```bash
INSTALL_CONFIG=luxe-cleaning VAPI_API_KEY=… npm run provision:vapi
```

## Railway variables (Astro service)

| Variable | Value |
|----------|--------|
| `INSTALL_CONFIG` | `luxe-cleaning` |
| `PUBLIC_SITE_DOMAIN` | production apex (e.g. `maidandmarble.com` until DNS moves) |
| `PUBLIC_INSTALL_HOMEPAGE_VOICE` | `1` |
| `COMPANY_NAME` | `Luxe Cleaning` |
| `COMPANY_DESCRIPTION` | Woman-owned premium house cleaning… |
| `COMPANY_SUPPORT_PHONE` | `+15089558850` |
| `VAPI_PHONE_NUMBER` | `+15089558850` |
| `VAPI_API_KEY` | private key |
| `PUBLIC_VAPI_PUBLIC_KEY` | browser SDK key |
| `PUBLIC_VAPI_ASSISTANT_ID` | assistant UUID (optional after first build) |
| `VAPI_CREATE_IF_MISSING` | `1` |
| `DATABASE_URL` | required at **build** time |

Every deploy runs **prebuild** → `scripts/sync-vapi-assistant.ts`. On the first build
with `VAPI_API_KEY` set it **creates** the assistant, saves the id to `company_config`,
syncs prompts, and attaches `VAPI_PHONE_NUMBER`.

Check build logs for `[vapi-sync] Created assistant …`. If you see `skipped`, the
install config slug or `VAPI_API_KEY` is missing on the **build** service.

## Vapi dashboard

1. Allow the production site origin on the public key.
2. Confirm **508-955-8850** appears under Phone Numbers.
3. After deploy, verify the number’s assistant matches `PUBLIC_VAPI_ASSISTANT_ID`.

## Verify

- Homepage shows **Luxe Cleaning** copy and **508-955-8850**.
- **Touch to speak** widget works on the deployed URL (not localhost).
- Inbound call to **508-955-8850** reaches the same assistant.
- Admin → Company shows Luxe Cleaning (update manually if DB still has Maid & Marble).
