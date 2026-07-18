# Telnyx Setup

Go live with Telnyx SMS, the AI phone agent, and Siri Shortcuts integration. Add vars to Railway → Astro service → Variables.

- [ ] Get API key from https://portal.telnyx.com/#/app/api-keys
- [ ] Add TELNYX_API_KEY to Railway vars
- [ ] Add TELNYX_FROM_NUMBER (E.164 format, e.g. +12125551234)
- [ ] In Telnyx portal → Messaging → Messaging Profiles → Inbound Webhook → set to https://<host>/api/sms
- [ ] In Telnyx portal → Numbers → your number → Call Control Webhook → set to https://<host>/api/voice/webhook
- [ ] Copy TELNYX_WEBHOOK_PUBLIC_KEY from the webhook config in the portal
- [ ] Add TELNYX_WEBHOOK_PUBLIC_KEY to Railway vars
- [ ] Set TELNYX_OPERATOR_NUMBER to your personal phone (E.164) for /takeover
- [ ] Create a Call Control Application in Telnyx portal and copy its ID as TELNYX_APP_ID (needed for outbound calls)
- [ ] Test inbound SMS: text your Telnyx number and verify webhook handling works
- [ ] Set VOICE_AGENT_ENABLED=1 and call the number to test the voice agent
- [ ] Set TELNYX_VOICE and TELNYX_VOICE_LANGUAGE if you want a different TTS voice
- [ ] Set SMS_AI_REPLY_ENABLED=1 if you want Claude to auto-reply to inbound texts
- [ ] For Siri Shortcuts: generate a key (`openssl rand -base64 32`) and add SIRI_API_KEY to Railway vars
- [ ] Test Siri integration: create a shortcut calling POST /api/siri (see knowledge: siri-shortcuts)
