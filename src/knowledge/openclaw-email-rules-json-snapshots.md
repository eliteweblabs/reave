# OpenClaw email rules — JSON snapshots

> **Source:** `openclaw-email-tools`. Snapshot: 2026-06-12. Not auto-synced — run this script after changes there.

---


## `src/config/status-rules.json` (shipped default in repo)
```json
{
  "rules": [
    {
      "status": "DELETE",
      "description": "Clear marketing trash — delete immediately",
      "phrases": [
        "unsubscribe",
        "you received this because"
      ],
      "matchMode": "any",
      "fields": [
        "subject",
        "body"
      ],
      "do": [
        "log"
      ],
      "enabled": true
    },
    {
      "status": "DOWN",
      "description": "UptimeRobot down alert — real-time Telegram",
      "phrases": [
        "UptimeRobot"
      ],
      "matchMode": "any",
      "fields": [
        "subject",
        "body"
      ],
      "do": [
        "trigger:telegram"
      ],
      "enabled": true
    },
    {
      "status": "NEEDS_CHECK",
      "description": "Security alerts — flag for review",
      "phrases": [
        "Security alert",
        "sign in was removed",
        "App password used"
      ],
      "matchMode": "any",
      "fields": [
        "subject",
        "body"
      ],
      "do": [],
      "enabled": true
    }
  ]
}```

## `data/status-rules.json` (local working copy)
```json
{
  "rules": [
    {
      "status": "DELETE",
      "description": "Clear marketing trash — delete immediately",
      "phrases": [
        "unsubscribe",
        "you received this because"
      ],
      "matchMode": "any",
      "fields": [
        "subject",
        "body"
      ],
      "do": [
        "delete"
      ],
      "enabled": true
    },
    {
      "status": "DOWN",
      "description": "UptimeRobot down alert — real-time Telegram",
      "phrases": [
        "UptimeRobot"
      ],
      "matchMode": "any",
      "fields": [
        "subject",
        "body"
      ],
      "do": [
        "trigger:telegram"
      ],
      "enabled": true
    },
    {
      "status": "NEEDS_CHECK",
      "description": "Security alerts — flag for review",
      "phrases": [
        "Security alert",
        "sign in was removed",
        "App password used"
      ],
      "matchMode": "any",
      "fields": [
        "subject",
        "body"
      ],
      "do": [],
      "enabled": true
    },
    {
      "status": "AUTO_ARCHIVED",
      "description": "Google Workspace monthly invoices — auto-archive",
      "phrases": [
        "Your Google Workspace monthly invoice"
      ],
      "matchMode": "any",
      "fields": [
        "subject"
      ],
      "do": [
        "archive",
        "log"
      ],
      "enabled": true
    }
  ]
}```

## `rules-openclaw-email-tools-production-a559-up-railway-app.json` (Railway export in that repo)
```json
{
  "rules": [
    {
      "status": "DELETE",
      "description": "Clear marketing trash — delete immediately",
      "phrases": [
        "unsubscribe",
        "you received this because"
      ],
      "matchMode": "any",
      "fields": [
        "subject",
        "body"
      ],
      "do": [
        "delete"
      ],
      "enabled": true
    },
    {
      "status": "DOWN",
      "description": "UptimeRobot down alert — real-time Telegram",
      "phrases": [
        "UptimeRobot"
      ],
      "matchMode": "any",
      "fields": [
        "subject",
        "body"
      ],
      "do": [
        "trigger:telegram"
      ],
      "enabled": true
    },
    {
      "status": "NEEDS_CHECK",
      "description": "Security alerts — flag for review",
      "phrases": [
        "Security alert",
        "sign in was removed",
        "App password used"
      ],
      "matchMode": "any",
      "fields": [
        "subject",
        "body"
      ],
      "do": [],
      "enabled": true
    }
  ]
}```
