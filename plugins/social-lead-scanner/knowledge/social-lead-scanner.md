# Agentic Social Lead Scanner

Watch keywords on the social networks you choose — Facebook, Instagram, X, LinkedIn, Reddit, Bluesky, Threads — and land matched posts in a triage inbox. The agent can draft replies; you post on the network until write APIs are approved.

This is a **paid add-on** (separate from Agentic Social Media and Reviews Triage).

## What ships today

- Keyword watchlist + platform picker in admin → **Social Leads**
- Scheduled cron poll (`/api/social-lead-scanner/poll`) — same pattern as property Lead Scanner
- Hit storage + inbox workflow (new → to-do → responded / dismissed)
- Agent tools: `list_social_leads`, `run_social_lead_scanner`, `update_social_lead`
- When **Agentic Social Media** is also enabled, matches merge into the unified Social inbox feed

## Platform adapters (roadmap)

Live ingestion requires official platform APIs + OAuth (no scraping). Adapters register in `socialLeadScannerEngine.ts` as they ship:

| Platform | Status |
|----------|--------|
| Facebook / Instagram | Pending Meta Graph OAuth |
| X / Twitter | Pending API tier + OAuth |
| LinkedIn | Pending partner API |
| Reddit | Reddit API adapter (planned) |
| Bluesky / Threads | Planned |

Until an adapter is live, cron runs record which platforms are pending — config and the inbox are ready.

## Legal / API notes

Use official platform APIs and business accounts only. Do not scrape. Auto-posting requires explicit write scopes and human review until App Review clears.
