# Sites — deployment

**Feature id:** `analytic_audit` (bundles `uptime_monitoring`)  
**Default status:** development until Google OAuth / UptimeRobot is connected in production.

Admin surface: **Sites** (`/admin?tab=analytics`) — combined uptime + Plausible fleet cards.

## Env

| Variable | Required | Notes |
|----------|----------|--------|
| `UPTIMEROBOT_API_KEY` | for uptime | From UptimeRobot Integrations → API |
| `UPTIMEROBOT_WEBHOOK_SECRET` | for uptime | Long random string for webhook auth |
| `UPTIMEROBOT_POLL_SECRET` | optional | Defaults to webhook secret for cron poll |
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

## Uptime webhook

UptimeRobot webhook → `/api/uptime/webhook?key=<secret>`

## Enable

Add `"analytic_audit"` to `config/config-{slug}.json` → `features`.  
`uptime_monitoring` turns on automatically (bundled requirement).

## Checklist

- [ ] Set `UPTIMEROBOT_*` on Astro service
- [ ] Configure UptimeRobot webhook
- [ ] APIs enabled in Google Cloud
- [ ] OAuth consent + redirect URI
- [ ] Connect Google from Admin → Sites
- [ ] Plausible env for fleet stats
- [ ] Optional IndexNow key for owned sites
