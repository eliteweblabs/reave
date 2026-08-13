---
feature: scheduling
defaultStatus: deployed
stage: 3
---

# Scheduling (Cal.com) deployment

## Sibling services

- **calcom-booking-api** — booking REST API on Railway
- **calcom-web-app** — Cal.com web UI (`CALCOM_WEBAPP_URL`)

## Required env vars

- `BOOKING_API_URL` — private URL, e.g. `http://${{ calcom-booking-api.RAILWAY_PRIVATE_DOMAIN }}:8080`
- `PUBLIC_BOOKING_API_URL` — public URL for client embeds
- `CALCOM_WEBAPP_URL` — Cal.com host (e.g. `https://cal.reave.app`)
- `CALCOM_USERNAME` — Cal.com account username
- `BOOKING_API_KEY` — optional; when calcom-booking-api enforces auth
- `CALENDAR_REMINDER_POLL_SECRET` — cron auth for `/api/calendar/reminders/poll?key=`
- `CALENDAR_REMINDER_POLL_MINUTES` — optional; default 1
- `CALENDAR_REMINDER_MINUTES` — optional comma-separated offsets; default `15`

## External setup

- Deploy calcom-booking-api + calcom-web-app on Railway
- Enable `scheduling` in install config `features[]`
- Add `schedule` to `footerNav` if not present
- Schedule cron to hit `/api/calendar/reminders/poll?key=<secret>` (in-process timer is a fallback)

## Checklist

- [ ] Deploy calcom-booking-api service
- [ ] Set `BOOKING_*` and `CALCOM_*` on Astro service
- [ ] Set `CALENDAR_REMINDER_POLL_SECRET` and schedule the poll cron
- [ ] Verify Schedule tab and agent booking tools
- [ ] Confirm a test booking fires a push + dashboard reminder ~15 minutes before start
- [ ] Set `moduleStatus.scheduling` → `deployed` in install config
