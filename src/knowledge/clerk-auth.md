# Clerk authentication (core)

Sign-in for this app is **Clerk** (`@clerk/astro`, `@clerk/backend`). That is always-on product, not an optional extra.

## What is always wired

- Admin sign-in sheets, passkeys, phone sign-in
- Publishable key + frontend proxy (`src/lib/clerkFrontendProxy.ts`)
- Session checks on admin routes
- `AGENT_ALERT_USER_ID` is a Clerk user id (deployment owner)

## Admin tools (keys, not a module)

Admin **Backend API tools** (`clerk_list_users`, `clerk_get_user`, `clerk_list_sessions`, orgs, ban/unban) live in `plugins/clerk-auth/`. They are core — not an optional module — and appear when `CLERK_SECRET_KEY` is set on the service.

If those tools are missing this turn, Clerk is still the auth system. Say "user-admin tools need CLERK_SECRET_KEY" — never "we don't have Clerk."

Clerk does not allow system-level access. Keys are per-app (`sk_` / `pk_`). `clerk_create_app`, `clerk_list_apps`, `clerk_get_app_keys`, and `clerk_delete_app` always return that — do not ask the owner to add `CLERK_PLATFORM_KEY` or provision a new Clerk app from chat. Backend user APIs need `CLERK_SECRET_KEY` for the current instance.
