/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  /** Optional: Anthropic (Claude) key for freeform tool-using replies */
  ANTHROPIC_API_KEY?: string;
  /** Optional: defaults to claude-sonnet-4-6 */
  ANTHROPIC_MODEL?: string;
  /** Anthropic Console org id — for live prepaid credit balance in /admin model switcher */
  ANTHROPIC_ORG_ID?: string;
  /** Anthropic Console sessionKey cookie — expires periodically; see .env.example */
  ANTHROPIC_SESSION_KEY?: string;
  /** Manual fallback prepaid balance in USD when live fetch is unavailable */
  ANTHROPIC_CREDIT_BALANCE_USD?: string;
  /** Optional override path for persisted runtime model choice */
  AGENT_MODEL_FILE?: string;
  /** Brave Search API key (web search tool for admin agent) */
  BRAVE_API_KEY?: string;
  /** Optional Google Cloud API key for PageSpeed Insights (higher quota than anonymous) */
  GOOGLE_PAGESPEED_API_KEY?: string;
  /** Optional: max user+assistant turns kept per admin chat (default 20) */
  AGENT_CHAT_HISTORY_TURNS?: string;
  /** Set to "1" on test/staging to expose /sign-up and link from sign-in (production stays sign-in only). */
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
  /** GitHub PAT (read-only Contents+Metadata) for dev/status tools. Recommended even for public repos to avoid rate limits. */
  GITHUB_TOKEN?: string;
  /** Optional alias for GITHUB_TOKEN. */
  GH_TOKEN?: string;
  /** Optional owner/repo override for status tools (default: eliteweblabs/reave). */
  GITHUB_REPO?: string;
  /** Default branch for create_github_branch from_branch and create_pull_request base (default: main). */
  GITHUB_DEFAULT_BRANCH?: string;
  /** Optional explicit health-check URL for check_deployment_status (default: RAILWAY_PUBLIC_DOMAIN or reave.app). */
  DEPLOY_HEALTH_URL?: string;
  /** Injected by Railway at deploy time — the live commit SHA (used to verify deploy is current). */
  RAILWAY_GIT_COMMIT_SHA?: string;
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
  /** Cloudflare API token — DNS edit on reave.app (Resend email records). Set on Railway reave service. */
  CLOUDFLARE_API_TOKEN?: string;
  /** Optional Cloudflare zone UUID for reave.app (auto-detected if omitted) */
  CLOUDFLARE_ZONE_ID?: string;
  /** Optional comma-separated allowlist of sender addresses */
  EMAIL_ALLOWED_SENDERS?: string;
  /** Optional comma-separated allowlist of sender domains */
  EMAIL_ALLOWED_DOMAINS?: string;
  /** Set to 0 to disable Claude triage on inbound email (keyword rules only) */
  EMAIL_AI_ENABLED?: string;
  /** Web Push VAPID keys — generate with: npx web-push generate-vapid-keys */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  /** mailto: or https: contact for VAPID subject (default mailto:thomas@reave.app) */
  VAPID_SUBJECT?: string;
  /** Set to 0 to disable Web Push notifications */
  PUSH_ENABLED?: string;
  /** Clerk user id — inbound alert emails post to admin "System alerts" chat */
  AGENT_ALERT_USER_ID?: string;
  /** Set to 0 to skip auto agent reply on alert emails (default: run agent) */
  AGENT_ALERT_AUTO_RUN?: string;
  /**
   * JSON array of optional modules enabled for this deployment, e.g.
   * '["client_portal","billing","site_audits","site_monitoring","web_handoff"]'
   */
  FEATURES?: string;
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
  /** JSON map of UptimeRobot monitor id → contact-api client uid, e.g. {"798092635":"uuid"}. */
  UPTIMEROBOT_MONITOR_CLIENT_MAP?: string;
  /** calcom-booking-api base URL — server-side (Railway internal or public). */
  BOOKING_API_URL?: string;
  /** Optional X-API-Key when calcom-booking-api has API_KEY set. */
  BOOKING_API_KEY?: string;
  /** Public calcom-booking-api URL for browser form (/form/schedule). */
  PUBLIC_BOOKING_API_URL?: string;
  /** Cal.com web app URL (e.g. https://cal.reave.app). */
  CALCOM_WEBAPP_URL?: string;
  /** Legacy alias for CALCOM_WEBAPP_URL. */
  CALCOM_API_URL?: string;
  /** Cal.com username slug (default reave). */
  CALCOM_USERNAME?: string;
  /** Pin default event type when creating bookings. */
  CALCOM_EVENT_TYPE_ID?: string;
  /** Timezone for schedule display (default America/New_York). */
  BOOKING_TIMEZONE?: string;
  /** Default job-site address when callers omit one (optional). */
  BOOKING_DEFAULT_ADDRESS?: string;
  /** Mapbox secret token for server-side geocoding (falls back to PUBLIC_MAPBOX_ACCESS_TOKEN). */
  MAPBOX_ACCESS_TOKEN?: string;
  /** Mapbox public token for static map previews in /admin schedule detail. */
  PUBLIC_MAPBOX_ACCESS_TOKEN?: string;
  /** Mavsafe / capco alias for the Mapbox public token (same pk.* value). */
  MAPBOX_PUBLIC_KEY?: string;
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
  /** Vapi assistant id for homepage voice widget. */
  PUBLIC_VAPI_ASSISTANT_ID?: string;
  PUBLIC_VAPI_ENABLE_VOICE_RECOGNITION?: string;
  PUBLIC_VAPI_VOICE_PROFILE_ID?: string;
  /** Installation homepage voice widget — separate from admin `vapi` plugin. */
  PUBLIC_INSTALL_HOMEPAGE_VOICE?: string;
}

/** Vapi web SDK attaches the constructor at runtime (`VoiceChatButton.astro`). */
interface Window {
  Vapi?: new (...args: unknown[]) => unknown;
}
