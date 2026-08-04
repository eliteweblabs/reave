# Online reviews inbox

Track company reviews from Google, Yelp, and other platforms. Reviews land in an **inbox to-do queue** — you draft replies in Reave, then post them on the platform yourself.

## Setup

1. Enable **online_reviews** in install config (`config/config-{slug}.json`).
2. Add the **Reviews** tab to `footerNav`.
3. For Google sync, set `GOOGLE_MAPS_API_KEY` (alias: `GOOGLE_PLACES_API_KEY`) and configure a **Google Place ID** in Reviews settings (or paste your Google Business profile URL under Admin → Socials — Reave extracts the Place ID when possible).
4. Yelp, Facebook, and other reviews can be added manually until direct API sync is wired.

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
