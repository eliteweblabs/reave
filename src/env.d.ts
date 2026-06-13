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
  /** Optional: Anthropic (Claude) key for freeform tool-using replies */
  ANTHROPIC_API_KEY?: string;
  /** Optional: defaults to claude-sonnet-4-6 */
  ANTHROPIC_MODEL?: string;
  /** Optional: max user+assistant turns kept per Telegram chat (default 20) */
  TELEGRAM_CHAT_HISTORY_TURNS?: string;
  /** eliteweblabs/contact-api base URL (no trailing slash), e.g. Railway public URL */
  CONTACT_API_BASE_URL?: string;
  /** Optional X-API-Key when contact-api has API_KEY set */
  CONTACT_API_KEY?: string;
  /** Crater custom API base URL (e.g. https://ap.reave.app) */
  CRATER_API_BASE_URL?: string;
  /** Mirror of Crater's OPENCLAW_API_TOKEN; sent as X-OpenClaw-Token */
  CRATER_API_TOKEN?: string;
  /** Railway public API (GraphQL). Create at railway.com/account/tokens — needs permission to create projects. */
  RAILWAY_API_TOKEN?: string;
  /** Optional: Cmd+K → Copy Active Workspace ID if projectCreate requires it */
  RAILWAY_WORKSPACE_ID?: string;
  /** If "1", /railway project … does not call Railway (safe rehearsal) */
  RAILWAY_DRY_RUN?: string;
  /** Optional suffix for project description field */
  RAILWAY_PROJECT_DESCRIPTION_PREFIX?: string;
  /** Shared secret: same value must appear as ?key= on /api/railway/webhook */
  RAILWAY_WEBHOOK_INGRESS_KEY?: string;
}

/** Vapi web SDK attaches the constructor at runtime (`VoiceChatButton.astro`). */
interface Window {
  Vapi?: new (...args: unknown[]) => unknown;
}
