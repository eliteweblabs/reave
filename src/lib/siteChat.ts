/**
 * Public site help chat (portal_assistant) — defaults + landing overrides.
 * Service landings use a footer dock that opens SiteAssistantWidget's sheet.
 */
export type SiteChatEngagementMode = 'scroll' | 'immediate' | 'none';

export type SiteChatEngagementConfig = {
  /** How the intro bubble appears. Default `scroll`. */
  mode?: SiteChatEngagementMode;
  /** Min scroll distance (px) before the delay starts. Default 64. */
  minScrollPx?: number;
  /** Delay after engagement before showing the intro. Default 3000. */
  delayMs?: number;
  /** Ignore scroll events for this long after load (avoids load noise). Default 900. */
  settleMs?: number;
};

export type SiteChatConfig = {
  /** When false, never mount the dock/sheet even if the module is on. */
  enabled?: boolean;
  /** Footer dock placeholder. Default “How can I help you?” */
  dockPlaceholder?: string;
  /** Sheet composer placeholder. Falls back to dockPlaceholder. */
  inputPlaceholder?: string;
  /** Random intro bubble lines (owner voice). */
  introPhrases?: string[];
  /** Sheet greeting when history is empty. Falls back to a random intro phrase. */
  greeting?: string;
  /** Avatar / icon URL for the sheet header and intro bubble. */
  avatarSrc?: string;
  /** Alt text for the avatar. */
  avatarAlt?: string;
  /** Sheet header title. Default: landing/company name. */
  headerTitle?: string;
  /** Sheet header subtitle. */
  headerSubtitle?: string;
  /** Prefix before call/email links in the sheet footer. Default “Emergency?” on service landings. */
  footerPrefix?: string;
  /** Hide the FAB and use a footer dock instead. Default true on service landings. */
  hideFab?: boolean;
  /** Intro bubble engagement. */
  engagement?: SiteChatEngagementConfig;
};

export type ResolvedSiteChat = {
  enabled: boolean;
  dockPlaceholder: string;
  inputPlaceholder: string;
  introPhrases: string[];
  greeting: string;
  avatarSrc: string;
  avatarAlt: string;
  headerTitle: string;
  headerSubtitle: string;
  footerPrefix: string;
  hideFab: boolean;
  engagement: {
    mode: SiteChatEngagementMode;
    minScrollPx: number;
    delayMs: number;
    settleMs: number;
  };
};

const DEFAULT_DOCK = 'How can I help you?';

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
  const mode: SiteChatEngagementMode =
    eng.mode === 'immediate' || eng.mode === 'none' || eng.mode === 'scroll'
      ? eng.mode
      : 'scroll';

  return {
    enabled: true,
    dockPlaceholder,
    inputPlaceholder,
    introPhrases,
    greeting,
    avatarSrc,
    avatarAlt,
    headerTitle,
    headerSubtitle,
    footerPrefix,
    hideFab,
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
