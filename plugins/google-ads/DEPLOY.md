---
feature: google_ads
defaultStatus: development
stage: 2
---

# Google Ads API deployment

Agent-managed Google Ads Search campaigns — OAuth, campaign CRUD, geo ad groups, RSA copy, performance sync to landing pages.

## Business context (Dr. Paws Calls reference install)

- **Service:** Dr. Paws Calls — in-home veterinary house calls (Dr. Kara Ryczek, DVM)
- **Locations:** Western Massachusetts & Connecticut towns (`src/lib/drPawsAdsTowns.ts`)
- **Campaign type:** Search
- **Use case:** Bulk create geo ad groups → `/vet/{town}` landing pages; pull performance & roll up by final URL

## Required env vars

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — same Cloud project as Search Console (enable Google Ads API)
- `GOOGLE_ADS_DEVELOPER_TOKEN` — from Google Ads API Center (Basic access minimum)
- `GOOGLE_ADS_CUSTOMER_ID` — 10-digit Ads account id (no dashes)
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` — optional MCC / manager account id

## OAuth & credential storage

1. Admin opens **GET `/api/admin/google-ads/connect`** (Clerk session required)
2. Refresh token stored in `integration_tokens` under provider `google_ads` (Postgres or local JSON file)
3. Customer id can live in env **or** agent tool `google_ads_set_customer_id` (persisted in token meta)
4. Audit trail: last 50 mutations appended to token `meta.auditLog`

## Agent tools

| Tool | Purpose |
|------|---------|
| `google_ads_status` | Wiring check + connect URL |
| `google_ads_list_accessible_customers` | Pick customer id after OAuth |
| `google_ads_set_customer_id` | Persist customer id |
| `google_ads_list_campaigns` | Campaign inventory |
| `google_ads_campaign_performance` | Date-range report + landing-page rollup (JSON) |
| `google_ads_create_search_campaign` | Custom Search campaign (dry_run default) |
| `google_ads_provision_dr_paws_geo` | One-shot Dr. Paws geo town campaign |

## Mutations & approval

- All write tools default **`dry_run=true`** — return planned structure only
- To apply: **`dry_run=false`** and **`confirm=true`**
- New campaigns default **PAUSED** — enable in Google Ads UI or pass `status=ENABLED` after review

## Automation triggers

| Trigger | Action |
|---------|--------|
| On-demand | Agent tools (primary) |
| Scheduled | Not wired yet — use agent cron / manual |
| Webhook | Not wired yet |

## External setup

1. Google Cloud Console → enable **Google Ads API**
2. OAuth consent screen → add scope `https://www.googleapis.com/auth/adwords`
3. Google Ads → Tools → API Center → developer token
4. Link OAuth user to the Ads account (Admin access)
5. Railway: set env vars above
6. Install config: add `google_ads` to `features[]`

## Checklist

- [ ] Add `google_ads` to install `features[]`
- [ ] Set developer token + customer id on Railway
- [ ] Connect OAuth via `/api/admin/google-ads/connect`
- [ ] Agent: `google_ads_status` → connected + customer id
- [ ] Agent: `google_ads_provision_dr_paws_geo` dry_run → review plan
- [ ] Agent: provision with `confirm=true` → PAUSED campaign in Ads
- [ ] Enable campaign after landing pages verified on production
- [ ] Weekly: `google_ads_campaign_performance` → map spend to `/vet/*` pages
