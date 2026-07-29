# Telnyx Setup

Go live with Telnyx SMS, the AI phone agent, and Siri Shortcuts integration. Add vars to Railway → Astro service → Variables.

## 10DLC campaign resubmission

After a failed carrier review, fix the public site first, then resubmit in Telnyx with an updated message flow.

- [ ] Remove SEO / lead-gen service language from the marketing site (carriers flag SEO as lead generation)
- [ ] Confirm the SMS opt-in form is live at **https://reave.app/form/sms-opt-in**
- [ ] Take a screenshot showing the **phone number field**, **unchecked SMS consent checkbox**, **full disclaimer**, and **Privacy Policy / Terms links**
- [ ] Upload the screenshot to a public host (Imgur, Google Drive, etc.) and paste the share link into the Telnyx **Message Flow / Opt-in workflow** field
- [ ] In the message flow, note: *Customers opt in through the contact form at https://reave.app/form/sms-opt-in (phone field + optional SMS checkbox with full CTIA disclaimer). Homepage contact section at https://reave.app/#contact uses the same consent language.*
- [ ] Resubmit the 10DLC campaign for review

Reference: [Telnyx 10DLC Opt-in Form](https://support.telnyx.com/en/articles/10684260-10dlc-opt-in-form)

## API & webhooks

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
