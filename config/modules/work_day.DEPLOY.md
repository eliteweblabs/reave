---
feature: work_day
defaultStatus: development
stage: 2
---

# Work Day deployment

## Sibling services

- Requires **Time Tracking** (`time_tracking`) — enabled automatically via `FEATURE_REQUIRES`
- **contact-api** for clients; **Postgres** (`DATABASE_URL`) for sessions, properties, GPS samples

## Required env vars

- `DATABASE_URL` — work day tables + time entry posting
- `CONTACT_API_BASE_URL` — client list / create from field PWA
- Optional: `GOOGLE_MAPS_API_KEY` — address autocomplete when adding properties

## External setup

- Enable `work_day` in install config `features[]` (or Add-ons)
- Field staff install PWA from **`/field/`** (Clerk sign-in, scope `/field`)
- Admin reconcile: footer **Work Day** tab → approve week → hours land on Work → Time

## Checklist

- [ ] Enable `work_day` in install config (confirms `time_tracking` is on)
- [ ] Set a project Address tab, open `/field/`, start work day on that project, switch project, stop
- [ ] Confirm admin Work Day summary shows hours and GPS sample count
- [ ] Approve a week and verify `job_time_entries` on the matching Work project
- [ ] Set `moduleStatus.work_day` → `deployed` when live
