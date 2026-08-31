/**
 * Public site help chat (portal_assistant) — defaults + landing.chat overrides.
 * Service landings use a footer dock that opens SiteAssistantWidget's sheet.
 */

export type SiteChatEngagementMode = 'scroll' | 'delay' | 'immediate' | 'none';

export type SiteChatDismissPersist = 'session' | 'local' | 'none';

export type SiteChatEngagementConfig = {
  /** How the intro bubble appears. Default `scroll`. */
  mode?: SiteChatEngagementMode;
  /** Min scroll distance (px) before the delay starts. Default 64. */
  minScrollPx?: number;
  /** Delay after engagement (or after load for `delay`/`immediate`) before showing. Default 3000. */
  delayMs?: number;
  /** Ignore scroll events for this long after load (avoids load noise). Default 900. */
  settleMs?: number;
};

/**
 * Raw shape in `config/sites/*-config.json` → `landing.chat`.
 * All fields optional; omitted values fall back in `resolveSiteChat`.
 */
export type SiteChatConfig = {
  /** When false, never mount the dock/sheet even if the module is on. */
  enabled?: boolean;
  /** Footer dock placeholder. Default “How can I help you?” */
  dockPlaceholder?: string;
  /** Sheet composer placeholder. Falls back to dockPlaceholder. */
  inputPlaceholder?: string;
  /** Random intro bubble lines (owner voice) — first-message array. */
  introPhrases?: string[];
  /** Sheet greeting when history is empty. Falls back to a random intro phrase. */
  greeting?: string;
  /** Avatar / face image for the sheet header and intro bubble. */
  avatarSrc?: string;
  /** Alt text for the avatar. */
  avatarAlt?: string;
  /**
   * Optional IOS_ICONS key when no avatar image is set (reserved for FAB/fallback).
   * Prefer `avatarSrc` for brand face.
   */
  iconKey?: string;
  /** Sheet header title. Default: landing/company name. */
  headerTitle?: string;
  /** Sheet header subtitle (often email/domain). */
  headerSubtitle?: string;
  /** Prefix before call/email links in the sheet footer. */
  footerPrefix?: string;
  /** Hide the FAB and use a footer dock instead. Default true on service landings. */
  hideFab?: boolean;
  /**
   * When hideFab is false: keep FAB hidden until engagement fires,
   * then reveal it (pairs with intro bubble).
   */
  revealFabOnEngagement?: boolean;
  /** Focusing the dock input opens the sheet. Default true. */
  openOnFocus?: boolean;
  /** Where intro dismiss is stored. Default `session`. */
  dismissPersist?: SiteChatDismissPersist;
  /** Storage key for intro dismiss. Default `svc-footer-chat-intro-dismissed`. */
  dismissStorageKey?: string;
  /** sessionStorage key for sheet message history. Default `sa-chat-site`. */
  historyStorageKey?: string;
  /** Intro bubble engagement. */
  engagement?: SiteChatEngagementConfig;
  /**
   * Extra business context for POST /api/site/assistant.
   * Prefer this for chat-specific notes; landing copy is still merged as fallback.
   */
  businessNotes?: string;
};

export type ResolvedSiteChat = {
  enabled: boolean;
  dockPlaceholder: string;
  inputPlaceholder: string;
  introPhrases: string[];
  greeting: string;
  avatarSrc: string;
  avatarAlt: string;
  iconKey: string;
  headerTitle: string;
  headerSubtitle: string;
  footerPrefix: string;
  hideFab: boolean;
  revealFabOnEngagement: boolean;
  openOnFocus: boolean;
  dismissPersist: SiteChatDismissPersist;
  dismissStorageKey: string;
  historyStorageKey: string;
  businessNotes: string;
  engagement: {
    mode: SiteChatEngagementMode;
    minScrollPx: number;
    delayMs: number;
    settleMs: number;
  };
};

const DEFAULT_DOCK = 'How can I help you?';
const DEFAULT_DISMISS_KEY = 'svc-footer-chat-intro-dismissed';
const DEFAULT_HISTORY_KEY = 'sa-chat-site';

function dismissPersistFrom(raw: unknown): SiteChatDismissPersist {
  const s = String(raw ?? 'session').toLowerCase();
  if (s === 'local' || s === 'none' || s === 'session') return s;
  return 'session';
}

export function resolveSiteChat(opts: {
  chat?: SiteChatConfig | null;
  /** Legacy fields previously hung off landing.schedule */
  legacy?: {
    dockPlaceholder?: string;
    introPhrases?: string[];
  } | null;
  brandName?: string;
  photoSrc?: string;
  photoAlt?: string;
  supportEmail?: string;
  domain?: string;
  /** Service landings default to dock mode + Emergency? footer. */
  serviceLanding?: boolean;
}): ResolvedSiteChat | null {
  const chat = opts.chat || {};
  if (chat.enabled === false) return null;

  const introPhrases = (
    chat.introPhrases?.length
      ? chat.introPhrases
      : opts.legacy?.introPhrases || []
  )
    .map((p) => String(p || '').trim())
    .filter(Boolean);

  const brandName = (opts.brandName || 'Chat').trim() || 'Chat';
  const dockPlaceholder =
    (chat.dockPlaceholder || opts.legacy?.dockPlaceholder || '').trim() || DEFAULT_DOCK;
  const inputPlaceholder =
    (chat.inputPlaceholder || '').trim() || dockPlaceholder;
  const greeting =
    (chat.greeting || '').trim() ||
    introPhrases[0] ||
    `Hi! This is ${brandName} — what’s up?`;
  const avatarSrc = (chat.avatarSrc || opts.photoSrc || '').trim();
  const avatarAlt = (chat.avatarAlt || opts.photoAlt || brandName).trim();
  const iconKey = String(chat.iconKey || '').trim();
  const headerTitle = (chat.headerTitle || brandName).trim();
  const headerSubtitle =
    (chat.headerSubtitle || opts.supportEmail || opts.domain || brandName).trim();
  const footerPrefix =
    (chat.footerPrefix || (opts.serviceLanding ? 'Emergency?' : 'Urgent?')).trim();
  const hideFab =
    typeof chat.hideFab === 'boolean'
      ? chat.hideFab
      : Boolean(opts.serviceLanding);

  const eng = chat.engagement || {};
  const modeRaw = String(eng.mode || 'scroll').toLowerCase();
  const mode: SiteChatEngagementMode =
    modeRaw === 'delay' ||
    modeRaw === 'immediate' ||
    modeRaw === 'none' ||
    modeRaw === 'scroll'
      ? modeRaw
      : 'scroll';

  return {
    enabled: true,
    dockPlaceholder,
    inputPlaceholder,
    introPhrases,
    greeting,
    avatarSrc,
    avatarAlt,
    iconKey,
    headerTitle,
    headerSubtitle,
    footerPrefix,
    hideFab,
    revealFabOnEngagement: chat.revealFabOnEngagement === true,
    openOnFocus: chat.openOnFocus !== false,
    dismissPersist: dismissPersistFrom(chat.dismissPersist),
    dismissStorageKey:
      String(chat.dismissStorageKey || '').trim() || DEFAULT_DISMISS_KEY,
    historyStorageKey:
      String(chat.historyStorageKey || '').trim() || DEFAULT_HISTORY_KEY,
    businessNotes: String(chat.businessNotes || '').trim(),
    engagement: {
      mode,
      minScrollPx:
        typeof eng.minScrollPx === 'number' && eng.minScrollPx >= 0
          ? eng.minScrollPx
          : 64,
      delayMs:
        typeof eng.delayMs === 'number' && eng.delayMs >= 0 ? eng.delayMs : 3000,
      settleMs:
        typeof eng.settleMs === 'number' && eng.settleMs >= 0
          ? eng.settleMs
          : 900,
    },
  };
}
