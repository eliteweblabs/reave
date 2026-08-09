# Analytic Audit — deployment

**Feature id:** `analytic_audit`  
**Default status:** development until Google OAuth is connected in production.

## Env

| Variable | Required | Notes |
|----------|----------|--------|
| `GOOGLE_CLIENT_ID` | for GSC/GA4 | Same OAuth client as YouTube social connect |
| `GOOGLE_CLIENT_SECRET` | for GSC/GA4 | Enable Search Console API, Google Analytics Data API, Google Analytics Admin API, Site Verification API |
| `PLAUSIBLE_API_BASE_URL` | for Plausible | Existing |
| `PLAUSIBLE_API_KEY` | for Plausible | Existing |
| `PLAUSIBLE_SITE_ID` | optional | Admin dashboard default site only — agent tools never auto-default |
| `INDEXNOW_KEY` | for IndexNow | Host `{key}.txt` (or keyLocation) on controlled sites |
| `CLOUDFLARE_API_TOKEN` | optional | Auto DNS TXT verify on `gsc_add_site` |
| `NAMECOM_USERNAME` / `NAMECOM_TOKEN` | optional | Alternate DNS verify path |

## OAuth callback

Register redirect URI:

`https://{your-domain}/api/admin/analytic-audit/callback`

## Enable

Add `"analytic_audit"` to `config/config-{slug}.json` → `features` (alongside `site_audits`).

## Checklist

- [ ] APIs enabled in Google Cloud
- [ ] OAuth consent + redirect URI
- [ ] Connect Google from Admin → Analytics
- [ ] Plausible env for default dashboard source
- [ ] Optional IndexNow key for owned sites
