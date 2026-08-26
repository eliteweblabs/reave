# Reviews triage

Track company reviews from Google™, Apple Maps, Yelp, Facebook, Tripadvisor, Trustpilot, and Glassdoor. Reviews land in a **triage queue** — you draft replies in Reave, then post them on the platform yourself.

Apple Maps and Apple Business Connect are the **same listing** (Connect is the dashboard; Maps is where ratings show). They are not two separate review products.

## Setup

1. Enable **online_reviews** in install config (`config/config-{slug}.json`).
2. Add the **Reviews** tab to `footerNav`.
3. For Google sync, set `GOOGLE_MAPS_API_KEY` (alias: `GOOGLE_PLACES_API_KEY`) and configure a **Google Place ID** in Reviews settings (or paste your Google Business profile URL under Admin → Socials — Reave extracts the Place ID when possible).
4. Apple Maps, Yelp, Facebook, Tripadvisor, Trustpilot, Glassdoor, and other reviews can be added manually until direct API sync is wired.

## Workflow

| Status | Meaning |
|--------|---------|
| **New** | Just fetched or added — needs a look |
| **To-do** | Queued for a reply |
| **Responded** | You posted a reply on the platform |
| **Dismissed** | No reply needed |

## Agent tools

- `list_online_reviews` — inbox or filter by status
- `update_online_review` — change status, save draft/final response
- `sync_google_reviews` — pull latest from Google Places API

## Limits

Google Places API returns up to **five** recent reviews per sync. Full history requires manual entry or future platform OAuth integrations.
