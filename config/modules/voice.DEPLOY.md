---
feature: voice
defaultStatus: pending
stage: 3
---

# Telnyx voice agent deployment

## Sibling services

- None — Telnyx Call Control handles telephony

## Required env vars

- `TELNYX_API_KEY` — Telnyx portal API key
- `TELNYX_FROM_NUMBER` — inbound number in E.164 format
- `TELNYX_WEBHOOK_PUBLIC_KEY` — webhook signature validation
- `VOICE_AGENT_ENABLED=1` — enable AI phone agent on inbound calls
- `TELNYX_OPERATOR_NUMBER` — transfer target for `/takeover`
- `TELNYX_APP_ID` — Call Control Application ID

## External setup

- Enable `voice` in install config `features[]`
- Configure Telnyx Messaging/Voice profile webhooks → `/api/voice/webhook`
- Set `ANTHROPIC_API_KEY` for AI replies during calls

## Checklist

- [ ] Set `TELNYX_*` and `VOICE_AGENT_ENABLED=1`
- [ ] Point Telnyx webhooks at production URL
- [ ] Place a test inbound call and verify AI greeting
- [ ] Set `moduleStatus.voice` → `deployed` in install config
