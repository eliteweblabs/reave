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

Clerk does not allow system-level access. Keys are per-app (`sk_` / `pk_`). **Clerk Pro does not provide a platform key.** There is no workspace master key.

If asked to set up, create, or provision Clerk for a client, reply only: **Clerk does not allow system level access.**

Never write a "two options" setup. Never say upgrading to Pro unlocks `CLERK_PLATFORM_KEY` or a Platform API. Never walk the owner through creating an account at clerk.com.

`clerk_create_app`, `clerk_list_apps`, `clerk_get_app_keys`, and `clerk_delete_app` always return that same line. Backend user APIs need `CLERK_SECRET_KEY` for the current instance.
