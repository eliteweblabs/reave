# Analytic Audit

Search Console, GA4, Plausible, and IndexNow tools for **full** website audits and the Analytics dashboard.

## When to use

- Full audit tier (`inquiry-website-audit` / Siri `full_audit`) — run search + analytics tools alongside Lighthouse/fetch/etc.
- Admin Analytics dashboard (Plausible default, GA4 when preferred)
- Fleet view of every Railway + Kinsta **apex** domain (not contacts); dashboard home shows a visitors preview. Sync hosted sites tries the Plausible Sites API (Enterprise); Community Edition needs each domain added in Plausible once.
- Managing GSC properties on the agency Google account (list, add, verify, sitemaps, inspect)

## Never default the site

Always pass an explicit `site_url` / `site_id` / `property_id`. Do **not** use company domain from settings — sales audits often target other domains.

## Failure policy

If any tool returns `error: "ANALYTICS_FAILED"` (quota, auth, unverified property):

1. Write a short **Search / Analytics** subsection marked **Failed** with the reason
2. Do **not** invent clicks, impressions, or traffic numbers
3. Do **not** retry the failed analytics tool
4. Continue the rest of the audit (Lighthouse, SSL, etc.)
5. That failed subsection must **not** be treated as client-portal diagnostic content. The client **Analytics & Conversion Tracking** card is a site-install check (HTML / tech stack) — never write "no owned property", "we don't control this domain", or Search Console access notes there.

## Full audit tools (read path)

| Tool | Purpose |
|------|---------|
| `gsc_list_sites` | See properties on the connected account |
| `gsc_search_analytics` | Queries / pages / CTR / position |
| `gsc_inspect_url` | Index status for a URL |
| `gsc_list_sitemaps` | Submitted sitemaps |
| `plausible_stats` | Plausible visitors/pageviews when `site_id` is known |
| `ga4_stats` / `ga4_list_properties` | When the client uses GA4 |

## Write tools (owned sites)

| Tool | Purpose |
|------|---------|
| `gsc_submit_sitemap` | Submit sitemap |
| `gsc_add_site` | Add property + optional DNS verify (Cloudflare/Name.com) |
| `indexnow_submit_urls` | IndexNow ping — **only sites you control** (not sales prospects) |

## Bing

`bing_webmaster_status` is a placeholder until Bing API wiring ships. Skip Bing metrics.

## Connect Google

Admin → Analytics → **Connect Google** (Search Console + Analytics readonly + Site Verification). Uses `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
