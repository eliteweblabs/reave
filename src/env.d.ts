/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  /** Optional: Anthropic (Claude) key for freeform tool-using replies */
  ANTHROPIC_API_KEY?: string;
  /** `reave` = copied from the official host; `client` = this install’s own key */
  ANTHROPIC_KEY_SOURCE?: string;
  /** Optional: defaults to claude-sonnet-4-6 */
  ANTHROPIC_MODEL?: string;
  /** Anthropic Console org id — for live prepaid credit balance in /admin model switcher */
  ANTHROPIC_ORG_ID?: string;
  /** Anthropic Console sessionKey cookie — expires periodically; see .env.example */
  ANTHROPIC_SESSION_KEY?: string;
  /** Manual fallback prepaid balance in USD when live fetch is unavailable */
  ANTHROPIC_CREDIT_BALANCE_USD?: string;
  /** USD that must remain before starting a Siri/Digital quick audit (default 1.5) */
  ANTHROPIC_AUDIT_RESERVE_QUICK_USD?: string;
  /** USD that must remain before starting a Siri/Digital full audit (default 4) */
  ANTHROPIC_AUDIT_RESERVE_FULL_USD?: string;
  /** Optional override path for persisted runtime model choice */
  AGENT_MODEL_FILE?: string;
  /** Brave Search API key (web search tool for admin agent) */
  BRAVE_API_KEY?: string;
  /** Pexels API key (royalty-free stock photo search for admin agent + /api/pexels/search) */
  PEXELS_API_KEY?: string;
  /** Optional Google Cloud API key for PageSpeed Insights (higher quota than anonymous) */
  GOOGLE_PAGESPEED_API_KEY?: string;
  /** Google Maps / Places server key for address autocomplete (admin scheduling). */
  GOOGLE_MAPS_API_KEY?: string;
  /** Mapbox access token — server-only geocoding/directions (not sent to the browser). */
  MAPBOX_ACCESS_TOKEN?: string;
  /** Mapbox token for client map rendering (admin UI, hero, dealer/client maps). Required for maps. */
  PUBLIC_MAPBOX_ACCESS_TOKEN?: string;
  /** Alias for GOOGLE_MAPS_API_KEY. */
  GOOGLE_PLACES_API_KEY?: string;
  /** Google OAuth client (YouTube social + Search Console / GA4 analytic_audit). */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Plausible Stats API (admin analytics + agent tools). */
  PLAUSIBLE_API_BASE_URL?: string;
  PLAUSIBLE_API_KEY?: string;
  PLAUSIBLE_SITE_ID?: string;
  /** IndexNow key for owned-site URL pings (not Google). */
  INDEXNOW_KEY?: string;
  /** Optional override path for integration OAuth tokens (GSC/GA4). */
  INTEGRATION_TOKENS_FILE?: string;
  /** Optional override path for social OAuth tokens. */
  SOCIAL_TOKENS_FILE?: string;
  /** Optional: max user+assistant turns kept per admin chat (default 20) */
  AGENT_CHAT_HISTORY_TURNS?: string;
  /** Set to "0" to hide sign-up (invite-only). Default: sign-up form is available. */
  PUBLIC_CLERK_ALLOW_SIGN_UP?: string;
  /** eliteweblabs/contact-api base URL (no trailing slash), e.g. Railway public URL */
  CONTACT_API_BASE_URL?: string;
  /** Optional X-API-Key when contact-api has API_KEY set */
  CONTACT_API_KEY?: string;
  /** CardDAV HTTP Basic username (iOS Contacts → Add Account → CardDAV) */
  CARDDAV_USERNAME?: string;
  /** CardDAV HTTP Basic password */
  CARDDAV_PASSWORD?: string;
  /** Optional bearer / header token (also accepts X-CardDAV-Token). Falls back to CONTACT_API_KEY. */
  CARDDAV_TOKEN?: string;
  /** Crater custom API base URL (e.g. https://ap.reave.app) */
  CRATER_API_BASE_URL?: string;
  /** Mirror of Crater's CRATER_API_TOKEN; sent as X-Crater-Api-Token */
  CRATER_API_TOKEN?: string;
  /** Railway public API (GraphQL). Create at railway.com/account/tokens — needs permission to create projects. */
  RAILWAY_API_TOKEN?: string;
  /** Optional default Railway project UUID for list_railway_domains (else match by name "Reave App") */
  RAILWAY_PROJECT_ID?: string;
  /** Optional: Cmd+K → Copy Active Workspace ID if projectCreate requires it */
  RAILWAY_WORKSPACE_ID?: string;
  /** If "1", /railway project … does not call Railway (safe rehearsal) */
  RAILWAY_DRY_RUN?: string;
  /** Optional suffix for project description field */
  RAILWAY_PROJECT_DESCRIPTION_PREFIX?: string;
  /** Kinsta REST API key (MyKinsta → Company settings → API keys) */
  KINSTA_API_KEY?: string;
  /** Kinsta company UUID (MyKinsta URL idCompany=… or Billing details) */
  KINSTA_COMPANY_ID?: string;
  /** Optional override for Kinsta API base URL (default https://api.kinsta.com/v2) */
  KINSTA_API_BASE_URL?: string;
  /** If "1", clear_kinsta_cache returns dry-run without calling Kinsta */
  KINSTA_DRY_RUN?: string;
  /** Shared secret: same value must appear as ?key= on /api/railway/webhook */
  RAILWAY_WEBHOOK_INGRESS_KEY?: string;
  /** Set to 1 to auto-investigate Railway deploy failures (repo lock + agent). Default: off. */
  RAILWAY_INCIDENT_HANDLER?: string;
  /** Kap plugin upload auth (X-Kap-Key / Bearer). View at /r/{token}. */
  KAP_UPLOAD_KEY?: string;
  /** GitHub PAT (read-only Contents+Metadata) for dev/status tools. Recommended even for public repos to avoid rate limits. */
  GITHUB_TOKEN?: string;
  /** Optional alias for GITHUB_TOKEN. */
  GH_TOKEN?: string;
  /** Optional owner/repo override for status tools (default: eliteweblabs/reave). */
  GITHUB_REPO?: string;
  /** Dedicated front-end website repo for the Agentic Website Editor (`owner/repo`). Client installs are locked to this repo. */
  GITHUB_WEBSITE_REPO?: string;
  /** GitHub App id — mints installation tokens when GITHUB_TOKEN is unset (client website editor). */
  GITHUB_APP_ID?: string;
  /** GitHub App installation id on the agency org (selected repos only). */
  GITHUB_APP_INSTALLATION_ID?: string;
  /** GitHub App private key (PEM). Tokens are minted scoped to GITHUB_WEBSITE_REPO. */
  GITHUB_APP_PRIVATE_KEY?: string;
  /** Default branch for create_github_branch from_branch and create_pull_request base (default: main). */
  GITHUB_DEFAULT_BRANCH?: string;
  /** Optional explicit health-check URL for check_deployment_status (default: RAILWAY_PUBLIC_DOMAIN or reave.app). */
  DEPLOY_HEALTH_URL?: string;
  /** When 0/off, allow admin chat sends during Railway deploys. Default: on when RAILWAY_GIT_COMMIT_SHA is set. */
  DEPLOY_CHAT_LOCK?: string;
  /** Defer GitHub commits and git push until agent chat turn ends (default on Railway). */
  DEFER_DEPLOY_UNTIL_TURN_END?: string;
  /**
   * Seconds between SIGTERM and SIGKILL on the previous Railway deploy.
   * Also read by processDrain so the app waits for in-flight agent runs.
   * Prefer setting via railway.json deploy.drainingSeconds (default 600).
   */
  RAILWAY_DEPLOYMENT_DRAINING_SECONDS?: string;
  /** Injected by Railway — replica id (used as agent-run lease owner hint). */
  RAILWAY_REPLICA_ID?: string;
  /** Injected by Railway at deploy time — the live commit SHA (used to verify deploy is current). */
  RAILWAY_GIT_COMMIT_SHA?: string;
  /** Injected by Railway at deploy time — commit message for the live deployment. */
  RAILWAY_GIT_COMMIT_MESSAGE?: string;
  /** Injected by Railway — this service's UUID (deploy-status GraphQL scope). */
  RAILWAY_SERVICE_ID?: string;
  /** Injected by Railway — this service's display name. */
  RAILWAY_SERVICE_NAME?: string;
  /** Injected by Railway — environment name (e.g. production). */
  RAILWAY_ENVIRONMENT_NAME?: string;
  /** Injected by Railway — public domain of the service (used for the health ping). */
  RAILWAY_PUBLIC_DOMAIN?: string;
  /** Injected by Railway — repo owner of the connected GitHub repo. */
  RAILWAY_GIT_REPO_OWNER?: string;
  /** Injected by Railway — repo name of the connected GitHub repo. */
  RAILWAY_GIT_REPO_NAME?: string;
  /** Resend API key — inbound email receiving (/api/email/inbound) */
  RESEND_API_KEY?: string;
  /** Resend webhook signing secret (whsec_…) for verifying inbound events */
  RESEND_WEBHOOK_SECRET?: string;
  /** Cloudflare API token — DNS read/edit on zones this token can access (all client domains in the account, not Resend-only). Set on Railway reave service. */
  CLOUDFLARE_API_TOKEN?: string;
  /** Optional Cloudflare zone UUID for reave.app (auto-detected if omitted) */
  CLOUDFLARE_ZONE_ID?: string;
  /** Optional comma-separated allowlist of sender addresses */
  EMAIL_ALLOWED_SENDERS?: string;
  /** Optional comma-separated allowlist of sender domains */
  EMAIL_ALLOWED_DOMAINS?: string;
  /** Optional extra recipient hosts this install may ingest (comma-separated) */
  EMAIL_INBOUND_DOMAINS?: string;
  /** Set to 0 to disable Claude triage on inbound email (keyword rules only) */
  EMAIL_AI_ENABLED?: string;
  /** Web Push VAPID keys — generate with: npx web-push generate-vapid-keys */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  /** mailto: or https: contact for VAPID subject (default mailto:thomas@reave.app) */
  VAPID_SUBJECT?: string;
  /** Set to 0 to disable Web Push notifications */
  PUSH_ENABLED?: string;
  /** Set to 0 to disable scheduled quiet hours (sleep mode). Default on when unset. */
  PUSH_QUIET_HOURS_ENABLED?: string;
  /** Quiet-hours start HH:MM local (default 23:00) */
  PUSH_QUIET_START?: string;
  /** Quiet-hours end HH:MM local (default 07:00) */
  PUSH_QUIET_END?: string;
  /** IANA timezone for quiet hours (default America/New_York) */
  PUSH_QUIET_TIMEZONE?: string;
  /** Set to 0 to block urgent client-reply pushes during quiet hours too */
  PUSH_QUIET_ALLOW_URGENT?: string;
  /** Clerk user id — inbound alert emails post to admin "System alerts" chat */
  AGENT_ALERT_USER_ID?: string;
  /** Set to 0 to skip auto agent reply on alert emails (default: run agent) */
  AGENT_ALERT_AUTO_RUN?: string;
  /**
   * JSON array of optional modules enabled for this deployment, e.g.
   * '["client_portal","billing","site_audits","site_monitoring","web_handoff"]'
   */
  FEATURES?: string;
  /** User-facing label for work records — singular lowercase, e.g. project, deal, lead, job (default: project). */
  POST_ALIAS?: string;
  /** Install config slug — loads config/config-{slug}.json */
  INSTALL_CONFIG?: string;
  /** Absolute path to install config JSON (overrides slug lookup). */
  INSTALL_CONFIG_FILE?: string;
  /** Self-hosted ChangeDetection.io base URL (no trailing slash). */
  CHANGEDETECTION_BASE_URL?: string;
  /** ChangeDetection.io API key (Settings → API). */
  CHANGEDETECTION_API_KEY?: string;
  /** Shared secret for /api/monitoring/changedetection?key= */
  CHANGEDETECTION_WEBHOOK_SECRET?: string;
  /** Hours between ChangeDetection checks per watch (default 24). */
  CHANGEDETECTION_CHECK_HOURS?: string;
  /** Minutes to suppress change alerts after a deploy (default 20). */
  CHANGEDETECTION_POST_DEPLOY_SUPPRESS_MINUTES?: string;
  /** UptimeRobot account API key (Integrations → API). */
  UPTIMEROBOT_API_KEY?: string;
  /** Shared secret for /api/uptime/webhook?key= and optional Authorization header. */
  UPTIMEROBOT_WEBHOOK_SECRET?: string;
  /** Optional secret for /api/uptime/poll?key= (defaults to UPTIMEROBOT_WEBHOOK_SECRET). */
  UPTIMEROBOT_POLL_SECRET?: string;
  /** API poll interval in minutes (default 5). */
  UPTIMEROBOT_POLL_MINUTES?: string;
  /**
   * Minutes between automatic Kinsta/Railway → UptimeRobot discovery runs.
   * Disabled by default (0/blank) because free-plan API creates always fail;
   * only useful on a paid plan where /v2/newMonitor works.
   */
  UPTIMEROBOT_DISCOVER_MINUTES?: string;
  /** JSON map of UptimeRobot monitor id → contact-api client uid, e.g. {"798092635":"uuid"}. */
  UPTIMEROBOT_MONITOR_CLIENT_MAP?: string;
  /** Comma-separated or JSON array of monitor IDs to skip push/system alerts for (e.g. 798092635). */
  UPTIMEROBOT_ALERT_SUPPRESS_MONITORS?: string;
  /** Comma-separated or JSON array of URL/name substrings to skip alerts (e.g. allautofinancial.com). */
  UPTIMEROBOT_ALERT_SUPPRESS_URLS?: string;
  /**
   * Notification email prefilled into the free-plan "quick-start" one-click links
   * (https://uptimerobot.com/quick-start?url=…&email=…). Optional; if unset the
   * owner types their email in the browser flow once per site.
   */
  UPTIMEROBOT_ALERT_EMAIL?: string;
  /** calcom-booking-api base URL — server-side (Railway internal or public). */
  BOOKING_API_URL?: string;
  /** Optional X-API-Key when calcom-booking-api has API_KEY set. */
  BOOKING_API_KEY?: string;
  /** Public calcom-booking-api URL for browser form (/form/schedule). */
  PUBLIC_BOOKING_API_URL?: string;
  /** Cal.com web app URL (e.g. https://cal.reave.app). Must be public — not *.railway.internal. */
  CALCOM_WEBAPP_URL?: string;
  /** Public Cal.com URL for attendee-facing links when CALCOM_WEBAPP_URL is internal. */
  PUBLIC_CALCOM_WEBAPP_URL?: string;
  /** Live demo install base URL for /demo sandbox link (e.g. https://demo.reave.app). */
  PUBLIC_DEMO_URL?: string;
  /** Optional full client portal URL on the demo install. */
  PUBLIC_DEMO_PORTAL_URL?: string;
  /** Optional contact slug on PUBLIC_DEMO_URL for /c/{slug} portal preview. */
  PUBLIC_DEMO_PORTAL_SLUG?: string;
  /** Legacy alias for CALCOM_WEBAPP_URL. */
  CALCOM_API_URL?: string;
  /** Cal.com username slug (default reave). */
  CALCOM_USERNAME?: string;
  /** Cal.com Postgres — so reave can push icon / username / email onto the first user. */
  CALCOM_DATABASE_URL?: string;
  /** Absolute brand-icon URL published for sibling services. */
  COMPANY_ICON_URL?: string;
  /** Pin default event type when creating bookings. */
  CALCOM_EVENT_TYPE_ID?: string;
  /** Timezone for schedule display (default America/New_York). */
  BOOKING_TIMEZONE?: string;
  /** Shared secret for /api/calendar/reminders/poll?key= */
  CALENDAR_REMINDER_POLL_SECRET?: string;
  /** Reminder poll interval in minutes (1–5, default 1). */
  CALENDAR_REMINDER_POLL_MINUTES?: string;
  /** Comma-separated reminder offsets in minutes (default 15). */
  CALENDAR_REMINDER_MINUTES?: string;
  /** Set to 0 to disable calendar booking reminders. */
  CALENDAR_REMINDERS_ENABLED?: string;
  /** Default job-site address when callers omit one (optional). Also the Mapbox office pin for the court gate. */
  BOOKING_DEFAULT_ADDRESS?: string;
  /** Miles from the Mapbox office pin used to pull courthouses (law installs). */
  COURT_RADIUS_MI?: string;
  /** Comma-separated counties for the court gate (law installs). */
  COURT_COUNTIES?: string;
  /** Comma-separated USPS state codes for the court gate (law installs). */
  COURT_STATES?: string;
  /** Legal department: bankruptcy | tax | foreclosure | general. */
  PRACTICE_AREA?: string;
  /** Court knowledge aggregation: radius | counties | state | both. */
  COURT_GATE_MODE?: string;
  /** Vapi private API key — prebuild assistant sync (scripts/sync-vapi-assistant.ts). */
  VAPI_API_KEY?: string;
  /** Vapi assistant id override for sync (defaults to PUBLIC_VAPI_ASSISTANT_ID). */
  VAPI_ASSISTANT_ID?: string;
  /** Set to 1 to skip Vapi assistant sync on build. */
  VAPI_SYNC_SKIP?: string;
  /** Set to 1 to fail build when Vapi sync errors. */
  VAPI_SYNC_REQUIRED?: string;
  /** Override synced first message (supports {{companyName}} etc.). */
  VAPI_FIRST_MESSAGE?: string;
  /** Override synced system prompt (supports {{companyName}} etc.). */
  VAPI_SYSTEM_PROMPT?: string;
  /** Vapi web SDK public key. */
  PUBLIC_VAPI_PUBLIC_KEY?: string;
  /** Vapi assistant id for Live Speak Agent Widget. */
  PUBLIC_VAPI_ASSISTANT_ID?: string;
  PUBLIC_VAPI_ENABLE_VOICE_RECOGNITION?: string;
  PUBLIC_VAPI_VOICE_PROFILE_ID?: string;
  /** Installation Live Speak Agent Widget — separate from admin `vapi` plugin. */
  PUBLIC_INSTALL_HOMEPAGE_VOICE?: string;
}

/** Vapi web SDK attaches the constructor at runtime (`VoiceChatButton.astro`). */
interface Window {
  Vapi?: new (...args: unknown[]) => unknown;
}

/**
 * Per-deploy cache-busting token for scripts served from `public/`, injected by
 * `vite.define` in astro.config.mjs. See scripts/asset-version.mjs for why those
 * files need one.
 */
declare const __PUBLIC_ASSET_VERSION__: string;
