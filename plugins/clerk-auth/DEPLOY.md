# Clerk Auth Plugin

Provides agent tools for managing Clerk authentication — users, sessions,
and organizations on the **current** Clerk app.

Clerk does not allow system-level access. There is no workspace master key
that can create, list, or delete other Clerk applications.

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `CLERK_SECRET_KEY` | For user/session/org tools | `sk_live_…` or `sk_test_…` — from Clerk dashboard → API Keys |

Set via Railway Variables → REΛVE Automation App → production.

Clerk is baseline on every package — not an optional `features[]` module. Admin tools load when the key above is set.

## Tools enabled by CLERK_SECRET_KEY

- `clerk_get_instance_status` — app config, auth strategies, plan info
- `clerk_list_users` / `clerk_get_user` / `clerk_create_user` / `clerk_update_user` / `clerk_delete_user`
- `clerk_ban_user` / `clerk_unban_user`
- `clerk_list_sessions` / `clerk_revoke_session`
- `clerk_list_organizations` / `clerk_create_organization`

## System-level tools (always refuse)

These exist so the agent gets a clear answer instead of inventing a workaround:

- `clerk_list_apps`
- `clerk_create_app`
- `clerk_get_app_keys`
- `clerk_delete_app`

Each responds: **Clerk does not allow system level access.**

Do not invent a manual clerk.com walkthrough or a Pro / Platform API alternative.
