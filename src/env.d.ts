/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  /** Telegram Bot API token from @BotFather */
  TELEGRAM_BOT_TOKEN?: string;
  /** Must match `secret_token` set on `setWebhook` (sent as `X-Telegram-Bot-Api-Secret-Token`) */
  TELEGRAM_WEBHOOK_SECRET?: string;
  /** Comma-separated Telegram user ids allowed to use the bot */
  TELEGRAM_ALLOWED_USER_IDS?: string;
  /** Numeric chat id for Railway deploy-failure webhooks (often your Telegram user id for DMs) */
  TELEGRAM_DEPLOY_NOTIFY_CHAT_ID?: string;
  /** Optional pinned deploy-status message id in TELEGRAM_DEPLOY_NOTIFY_CHAT_ID chat */
  TELEGRAM_DEPLOY_PIN_MESSAGE_ID?: string;
  /** Optional: Anthropic (Claude) key for freeform tool-using replies */
  ANTHROPIC_API_KEY?: string;
  /** Optional: defaults to claude-sonnet-4-6 */
  ANTHROPIC_MODEL?: string;
  /** Optional override path for persisted runtime model choice */
  AGENT_MODEL_FILE?: string;
  /** Brave Search API key (web search tool for Telegram agent) */
  BRAVE_API_KEY?: string;
  /** Optional Google Cloud API key for PageSpeed Insights (higher quota than anonymous) */
  GOOGLE_PAGESPEED_API_KEY?: string;
  /** Optional: max user+assistant turns kept per Telegram chat (default 20) */
  TELEGRAM_CHAT_HISTORY_TURNS?: string;
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
  /** Chat id for inbound email alerts; falls back to TELEGRAM_DEPLOY_NOTIFY_CHAT_ID */
  EMAIL_NOTIFY_CHAT_ID?: string;
  /** Optional comma-separated allowlist of sender addresses */
  EMAIL_ALLOWED_SENDERS?: string;
  /** Optional comma-separated allowlist of sender domains */
  EMAIL_ALLOWED_DOMAINS?: string;
}

/** Vapi web SDK attaches the constructor at runtime (`VoiceChatButton.astro`). */
interface Window {
  Vapi?: new (...args: unknown[]) => unknown;
}
