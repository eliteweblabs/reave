# Two-Way SMS (Telnyx)

Send and receive SMS on the install’s Telnyx number. Threads stay with the contact — from admin chat, the agent, Siri (`send_sms`), document/share delivery, or the client portal.

**Demo note:** SMS cannot be tested in a demo environment. It needs a live Telnyx number, messaging profile, and (in the US) A2P / 10DLC registration.

## Env

- `TELNYX_API_KEY`
- `TELNYX_FROM_NUMBER` (E.164)
- `TELNYX_WEBHOOK_PUBLIC_KEY` for inbound signature checks

Enable the `sms` module in install config `features[]`.

## Inbound

Telnyx Messaging Profile webhook → `POST /api/sms`. Inbound messages post to System alerts (when `AGENT_ALERT_USER_ID` is set) and may auto-reply via the AI agent.

## Outbound

Agent / share / document send paths use `sendSms` when Telnyx is configured. Siri action: `{"action":"send_sms","to":"+1…","message":"…"}`.

## Consent

Public forms that collect a mobile number should use the SMS opt-in checkbox helpers (`smsConsent`) so marketing/transactional texts stay compliant.
