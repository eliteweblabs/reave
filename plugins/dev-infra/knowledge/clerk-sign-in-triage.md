# Clerk sign-in triage — agent playbook

Sign-in lives almost entirely **outside this repo**: the Clerk instance config, the
Google Cloud OAuth client, and Railway env vars. Reverting commits does not touch any
of them, so "I rewound the code and it is still broken" is the normal outcome, not a
sign that the revert failed.

**Do not** add fetch/XHR interceptors, cache-busting retry loops, or service-worker
purges to work around a sign-in failure. That was tried (`public/clerk-client-guard.js`)
and had to be reverted for breaking sign-in rendering. Diagnose first — every check
below is a `curl` away.

## Step 1 — Read the instance config from the Frontend API

No secret key needed; the publishable key's host is the FAPI host.

```
curl -s "https://clerk.<domain>/v1/environment" -H "Origin: https://<domain>" | jq '{
  first_factors: .auth_config.first_factors,
  email: .user_settings.attributes.email_address,
  password: .user_settings.attributes.password,
  preferred: .display_config.preferred_sign_in_strategy,
  social: [.user_settings.social | to_entries[] | select(.value.enabled) | .key]
}'
```

## Step 2 — Read the first factors an actual attempt gets offered

```
curl -s -X POST "https://clerk.<domain>/v1/client/sign_ins" \
  -H "Origin: https://<domain>" \
  --data-urlencode "identifier=probe-not-a-real-user@example.com" | jq '.meta.client.sign_in'
```

A `422 form_identifier_not_found` is the expected answer, and
`supported_first_factors` in the attached client is the real list of ways anyone can
get in. **If every entry there is an OAuth strategy, an outage at that provider locks
out the whole install.**

## Step 3 — Drive the real card in a browser

Headless Chromium reaches production Clerk (a `pk_live_` key rejects `localhost`, so
there is no local equivalent). Playwright ships in devDependencies:

```js
const browser = await chromium.launch({ channel: 'chromium', args: ['--no-sandbox'] });
```

Use `channel: 'chromium'` — the default headless shell crashes on this app's WebGL
bundles. Log `framenavigated` and every `clerk.<domain>/v1/` response body, then click
`.cl-formButtonPrimary` (the card's own submit; `:has-text("Continue")` also matches
the Google button).

## Known failure modes

### Google OAuth `redirect_uri_mismatch`

Clicking **Continue with Google** lands on
`accounts.google.com/signin/oauth/error?authError=…`. Base64-decode `authError`: it
names the offending `redirect_uri`. A production Clerk instance uses **custom** Google
credentials, so the Google Cloud OAuth client must list
`https://clerk.<domain>/v1/oauth_callback` under **Authorized redirect URIs** — Clerk's
shared dev credentials do not apply. Fix it in Google Cloud Console, not in this repo.

### Only OAuth is a first factor

`email_code` missing from `auth_config.first_factors`, or
`user_settings.attributes.password.used_for_first_factor: false`, means the embedded
card can start a sign-in (the email field is still there, because email is a valid
*identifier*) but cannot finish one. Submitting the identifier alone routes to
`#/factor-one`, which then offers only the social buttons. Keep **email verification
code** enabled as a sign-in strategy so one broken OAuth provider is not a lockout.

### Stale hash step in the URL

Clerk hash routing writes the step into the URL, and it outlives the attempt, so
`/admin/?auth=sign-in#/factor-one` used to reopen an unrenderable step as an empty
sheet. `src/components/SignInSheet.astro` now drops known-stale steps on load and
leaves `/sso-callback`, `/continue`, and the `/verify-*` landing steps alone.

## What is *not* the problem

- **clerk-js version.** `PUBLIC_CLERK_JS_VERSION` is unnecessary; unset, `@clerk/astro`
  requests the version matching its own `@clerk/shared`. The Frontend API accepts the
  `__clerk_api_version` clerk-js sends (verify with the Step 1 call — the response
  carries a `clerk-api-version` header).
- **Cached/stale clerk-js.** `src/middleware.ts` already sends
  `no-cache, no-store, must-revalidate` for `/admin/` and every `/admin/*.js`.
- **CSP.** `src/lib/securityHeaders.ts` derives the instance origins from the
  publishable key. A CSP block shows up as a `Refused to load` console error, nothing
  subtler.
