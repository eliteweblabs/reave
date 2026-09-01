# Clerk authentication (client installs)

Each client install has **its own Clerk application** — not a satellite of reave.app.

## Per-install Clerk (required)

1. Create a new application at [dashboard.clerk.com](https://dashboard.clerk.com) for the client (e.g. "Life Saving Fire Protection").
2. Enable **phone number** sign-in (OTP) under User & authentication.
3. Add the install’s public host as the **primary domain** (e.g. `life-saving.reave.app` or `app.client.com`). Do **not** add it as a satellite of reave.app.
4. Copy **API keys** into the install’s Railway service:
   - `PUBLIC_CLERK_PUBLISHABLE_KEY` (`pk_live_…` / `pk_test_…`)
   - `CLERK_SECRET_KEY` (`sk_live_…` / `sk_test_…`)
5. Set `AGENT_ALERT_USER_ID` to the owner’s Clerk user id (`user_…`) after their first sign-in (or create the user with the owner phone in Clerk).
6. Redeploy. `/__clerk` proxy registers on apply; optional `clerk.` CNAME is not required when proxy is enabled.

The deploy wizard **does not** copy reave.app Clerk keys onto client installs.

## NFC /card login

The card page texts a one-time code to the **Company support phone** (Admin → Company). That number must match a phone on the owner’s Clerk user in **this install’s** Clerk app.

Flow: tap Login → Clerk sends SMS to the card phone → owner enters code → session on this install → admin if `AGENT_ALERT_USER_ID` matches.

Do not share reave.app’s Clerk instance across client installs — shared keys cause `operation_not_allowed_on_satellite_domain` and broken card login.
