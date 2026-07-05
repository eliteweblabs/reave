# UptimeRobot monitoring

Reave replaces UptimeRobot email alerts with direct API polling, webhooks, and in-app notifications.

## Enable

1. Add `uptime_monitoring` to `FEATURES`.
2. Set `UPTIMEROBOT_API_KEY` (Integrations → API on uptimerobot.com).
3. Set `UPTIMEROBOT_WEBHOOK_SECRET` (long random string).
4. Ensure `DATABASE_URL` is set (incident history lives in App Postgres).

## Webhook setup (UptimeRobot dashboard)

Create a **Webhook** integration:

- **URL:** `https://reave.app/api/uptime/webhook?key=<UPTIMEROBOT_WEBHOOK_SECRET>`
- **Send as JSON:** on
- **POST value (recommended):**

```json
{
  "monitorID": "*monitorID*",
  "monitorURL": "*monitorURL*",
  "monitorFriendlyName": "*monitorFriendlyName*",
  "alertType": "*alertType*",
  "alertTypeFriendlyName": "*alertTypeFriendlyName*",
  "alertDetails": "*alertDetails*",
  "alertDuration": "*alertDuration*",
  "friendlyMessage": "Monitor is *alertTypeFriendlyName*: *monitorFriendlyName* (*monitorURL*)"
}
```

Disable UptimeRobot **email** alert contacts for these monitors once webhooks are verified.

## API routes

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /api/uptime/monitors` | Clerk | All monitors + status from DB |
| `GET /api/uptime/monitors/:id/incidents` | Clerk | Incident history |
| `GET /api/uptime/summary` | Clerk | Dashboard aggregate |
| `POST /api/uptime/webhook?key=` | Webhook secret | Real-time up/down events |
| `GET /api/uptime/poll?key=` | Poll secret or Clerk | Force API sync |

Background polling runs every 5 minutes (override with `UPTIMEROBOT_POLL_MINUTES`) when the feature is enabled.

## Client linking

Monitors auto-link to clients when the monitor URL matches the portal **Site URL** or **website** field.

Manual override via Railway env:

```json
UPTIMEROBOT_MONITOR_CLIENT_MAP='{"798092635":"<client-uid>","802724019":"<client-uid>"}'
```

Linked clients see **Site uptime** status and recent incidents on `/c/:uid`.

## Notifications

Down/up events post to admin **System alerts** chat and send Web Push (same as Railway and site-change alerts). The legacy email rule matching `UptimeRobot` in subject/body is disabled by default.

## Known monitors (Reave account)

| Site | Monitor ID |
|------|------------|
| allautofinancial.com | 798092635 |
| mavsafe.com | 802724019 |

Add others as they are created in UptimeRobot; they sync automatically on poll/webhook.
