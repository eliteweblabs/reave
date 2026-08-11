# Clerk Auth Plugin

Provides agent tools for managing Clerk authentication — users, sessions,
organizations, and (on Pro/Enterprise) multi-app provisioning.

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `CLERK_SECRET_KEY` | For user/session/org tools | `sk_live_…` or `sk_test_…` — from Clerk dashboard → API Keys |
| `CLERK_PLATFORM_KEY` | For multi-app tools | Requires Clerk **Pro or Enterprise** account |

Set via Railway Variables → REΛVE Automation App → production.

## Feature flag

Add `"clerk_auth"` to the install's `features` array in `config/config-{slug}.json`.

## Tools enabled by CLERK_SECRET_KEY

- `clerk_get_instance_status` — app config, auth strategies, plan info
- `clerk_list_users` / `clerk_get_user` / `clerk_create_user` / `clerk_update_user` / `clerk_delete_user`
- `clerk_ban_user` / `clerk_unban_user`
- `clerk_list_sessions` / `clerk_revoke_session`
- `clerk_list_organizations` / `clerk_create_organization`

## Tools enabled by CLERK_PLATFORM_KEY (Pro/Enterprise only)

- `clerk_list_apps` — list all Clerk applications on the account
- `clerk_create_app` — provision a new Clerk app for a client, returns publishable + secret keys
- `clerk_get_app_keys` — retrieve keys for an existing app
- `clerk_delete_app` — permanently remove an app

## Typical new-client flow (Pro)

1. `clerk_create_app { name: "Client Name" }` → get `app_id`, `publishable_key`, `secret_key`
2. `set_railway_variables` → push keys to the client's Railway service
3. `update_work` → log app_id in the project notes
4. `set_client_portal` → store keys in client Data vault

## Hobby plan limitation

On the Hobby (free) plan, only `CLERK_SECRET_KEY` is available for the single
default app. `CLERK_PLATFORM_KEY` and multi-app provisioning require upgrading
to Pro at https://clerk.com/pricing.
