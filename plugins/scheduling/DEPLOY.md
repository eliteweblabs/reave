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
- `CALCOM_USERNAME` — filled from the install slug (company / domain). Set on **reave** and referenced on **calcom-booking-api** (`${{ reave.CALCOM_USERNAME }}`). Without it on the booking API, Schedule shows "User not found". The reave.app node creates the Cal.com owner + 15/30/60 event types when the database is empty (signup stays off).
- `BOOKING_API_KEY` — optional; when calcom-booking-api enforces auth
- `CALENDAR_REMINDER_POLL_SECRET` — cron auth for `/api/calendar/reminders/poll?key=`
- `CALENDAR_REMINDER_POLL_MINUTES` — optional; default 1
- `CALENDAR_REMINDER_MINUTES` — optional comma-separated offsets; seeds Admin → Settings until saved (default `15`)

## External setup

- Deploy calcom-booking-api + calcom-web-app on Railway
- On **calcom-web-app**, do not type mail or profile secrets — reference `reave`:
  - `EMAIL_FROM=${{ reave.EMAIL_FROM }}` (alias of `RESEND_FROM` — required or Cal.com uses sendmail)
  - `EMAIL_FROM_NAME=${{ reave.EMAIL_FROM_NAME }}`
  - `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_COMPANY_NAME` = `${{ reave.EMAIL_FROM_NAME }}`
  - `NEXT_PUBLIC_SUPPORT_MAIL_ADDRESS=${{ reave.EMAIL_FROM }}`
  - `RESEND_API_KEY=${{ reave.RESEND_API_KEY }}`
  - `EMAIL_SERVER_PASSWORD` — Railway reference to `reave.RESEND_API_KEY` (host `smtp.resend.com` / port `465` / user `resend`)
- On **reave**, `CALCOM_DATABASE_URL=${{ calcom-postgres.DATABASE_URL }}` so a later Cal.com deploy still gets icon / username / email from company settings (`GET /api/install/identity`) and can insert the owner user
- On **calcom-booking-api**, `CALCOM_USERNAME=${{ reave.CALCOM_USERNAME }}` and `MAPBOX_ACCESS_TOKEN=${{ reave.PUBLIC_MAPBOX_ACCESS_TOKEN }}`
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
