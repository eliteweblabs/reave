# Clerk authentication (core)

Sign-in for this app is **Clerk** (`@clerk/astro`, `@clerk/backend`). That is always-on product, not an optional extra.

## What is always wired

- Admin sign-in sheets, passkeys, phone sign-in
- Publishable key + frontend proxy (`src/lib/clerkFrontendProxy.ts`). Production installs default clerk-js to same-origin `/__clerk` so `clerk.{apex}` does not have to be a live Clerk CNAME (WordPress/Kinsta zones often intercept it). The Node proxy forwards to `frontend-api.clerk.dev` with `Clerk-Proxy-Url`, `Clerk-Secret-Key`, and `X-Forwarded-For`, and registers that URL on the Clerk domain. Opt out with `PUBLIC_CLERK_PROXY_URL=none`. Development keys (`pk_test_`) never use the proxy.
- Empty Sign in sheet + console `ChunkLoadError` / `/__clerk` 500s: the proxy crashed. Official FAPI often returns 400 until `proxy_url` is saved on the Clerk domain; the old fallback then fetched `clerk.{host}` and died on TLS alert 40 when that hostname has a CNAME but no Clerk cert (`clerk.app.example.com` is the usual case). `/__clerk` must not throw — return the official response or 502. Then `GET /api/health/live` registers `https://{app-host}/__clerk` on the **primary** Clerk domain only. Never create a Clerk satellite for a client host — satellites cannot run sign-in/sign-up (`operation_not_allowed_on_satellite_domain`). Client auth is `/admin/login` on that install’s own domain. `reave.app/__clerk` working does **not** mean a client install's instance FAPI is healthy.
- Session checks on admin routes
- `AGENT_ALERT_USER_ID` is a Clerk user id (deployment owner)

## Admin tools (keys, not a module)

Admin **Backend API tools** (`clerk_list_users`, `clerk_get_user`, `clerk_list_sessions`, orgs, ban/unban) live in `plugins/clerk-auth/`. They are core — not an optional module — and appear when `CLERK_SECRET_KEY` is set on the service (aliases: `CLERK_BACKEND_API_KEY`, `CLERK_SECRET`). The sign-in sheet reads `PUBLIC_CLERK_PUBLISHABLE_KEY` (aliases: `CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`).

If those tools are missing this turn, Clerk is still the auth system. Say "user-admin tools need CLERK_SECRET_KEY" — never "we don't have Clerk."

Clerk does not allow system-level access. Keys are per-app (`sk_` / `pk_`). **Clerk Pro does not provide a platform key.** There is no workspace master key.

If asked to set up, create, or provision Clerk for a client, reply only: **Clerk does not allow system level access.**

Never write a "two options" setup. Never say upgrading to Pro unlocks `CLERK_PLATFORM_KEY` or a Platform API. Never walk the owner through creating an account at clerk.com.

`clerk_create_app`, `clerk_list_apps`, `clerk_get_app_keys`, and `clerk_delete_app` always return that same line. Backend user APIs need `CLERK_SECRET_KEY` for the current instance.
