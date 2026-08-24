/**
 * Canonical catalog of social platforms supported in admin → Socials.
 * Link fields are stored on company config; OAuth/API access is optional per platform.
 */
import type { CompanyConfig } from '../companyConfig.ts';
import type { SocialPlatformId } from './types.ts';

export interface SocialPlatformDef {
  id: SocialPlatformId;
  label: string;
  followersLabel: string;
  /** Company-config field holding the stored link/handle. */
  field: keyof CompanyConfig;
  /** Fixed host/path shown before the handle input (no protocol). */
  prefix: string;
  /** Optional host suffix, e.g. `.bsky.social` or `.substack.com`. */
  suffix?: string;
  /** Placeholder for the editable handle only. */
  placeholder: string;
  /** Character class allowed in the handle (Reddit-style: `A-Za-z0-9_`). */
  handleCharset?: string;
  /** Max handle length when `handleCharset` is set. */
  handleMaxLength?: number;
  /** Simple Icons slug for dashboard/settings UI. */
  iconSlug: string;
  /** Brand accent color (hex). */
  color: string;
  /** Build a canonical profile URL from a bare handle. */
  profileUrl: (handle: string) => string;
}

export type SocialPlatformAffix = Pick<SocialPlatformDef, 'prefix' | 'suffix'>;

/** Platforms shown by default until an admin hides them. */
export const DEFAULT_VISIBLE_SOCIAL_PLATFORMS: SocialPlatformId[] = [
  'twitter',
  'instagram',
  'linkedin',
  'facebook',
  'youtube',
  'tiktok',
  'bluesky',
  'threads',
];

function stripProtocol(value: string): string {
  return value.replace(/^https?:\/\//i, '');
}

function applySocialSuffix(handle: string, suffix: string | undefined): string {
  if (!suffix) return handle;
  if (handle.toLowerCase().endsWith(suffix.toLowerCase())) return handle;
  // Custom domains already contain a dot — don't append `.bsky.social` / `.substack.com`.
  if (handle.includes('.')) return handle;
  return `${handle}${suffix}`;
}

/** Pull a typed handle out of a stored URL, host/path, or bare value. */
export function extractSocialHandle(raw: string, platform?: SocialPlatformAffix | null): string {
  const original = (raw || '').trim();
  if (!original) return '';

  const prefix = stripProtocol(platform?.prefix || '');
  const suffix = platform?.suffix || '';
  const stripped = stripProtocol(original);
  const lower = stripped.toLowerCase();
  const prefixLower = prefix.toLowerCase();

  let value = stripped;
  if (prefixLower && lower.startsWith(prefixLower)) {
    value = stripped.slice(prefix.length);
  } else if (prefixLower && lower.startsWith('www.') && lower.slice(4).startsWith(prefixLower)) {
    value = stripped.slice(4 + prefix.length);
  } else if (/^https?:\/\//i.test(original) || stripped.includes('/')) {
    try {
      const url = new URL(/^https?:\/\//i.test(original) ? original : `https://${stripped}`);
      const segments = url.pathname.split('/').filter(Boolean);
      const last = segments[segments.length - 1] || '';
      if (last) {
        value = last;
      } else if (suffix && url.hostname.toLowerCase().endsWith(suffix.toLowerCase())) {
        value = url.hostname.slice(0, -suffix.length);
      } else {
        value = url.hostname;
      }
    } catch {
      value = stripped;
    }
  }

  if (suffix && value.toLowerCase().endsWith(suffix.toLowerCase())) {
    value = value.slice(0, -suffix.length);
  }

  return value.replace(/^@/, '').replace(/^\/+|\/+$/g, '');
}

/** Canonical https URL from a typed handle (or a pasted URL/path). */
export function composeSocialUrl(handle: string, platform: SocialPlatformAffix): string {
  const extracted = extractSocialHandle(handle, platform);
  if (!extracted) return '';
  const full = applySocialSuffix(extracted, platform.suffix);
  const prefix = stripProtocol(platform.prefix || '');
  return `https://${prefix}${full}`;
}

function urlFromHandle(prefix: string, suffix?: string): (handle: string) => string {
  return (handle) => composeSocialUrl(handle, { prefix, suffix });
}

export const SOCIAL_PLATFORM_CATALOG: SocialPlatformDef[] = [
  {
    id: 'twitter',
    label: 'X / Twitter',
    followersLabel: 'Followers',
    field: 'socialTwitter',
    prefix: 'x.com/',
    placeholder: 'yourcompany',
    iconSlug: 'x',
    color: '#1d9bf0',
    profileUrl: urlFromHandle('x.com/'),
  },
  {
    id: 'instagram',
    label: 'Instagram',
    followersLabel: 'Followers',
    field: 'socialInstagram',
    prefix: 'instagram.com/',
    placeholder: 'yourcompany',
    iconSlug: 'instagram',
    color: '#e1306c',
    profileUrl: urlFromHandle('instagram.com/'),
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    followersLabel: 'Followers',
    field: 'socialLinkedin',
    prefix: 'linkedin.com/company/',
    placeholder: 'yourcompany',
    iconSlug: 'linkedin',
    color: '#0a66c2',
    profileUrl: urlFromHandle('linkedin.com/company/'),
  },
  {
    id: 'facebook',
    label: 'Facebook',
    followersLabel: 'Followers',
    field: 'socialFacebook',
    prefix: 'facebook.com/',
    placeholder: 'yourcompany',
    iconSlug: 'facebook',
    color: '#1877f2',
    profileUrl: urlFromHandle('facebook.com/'),
  },
  {
    id: 'youtube',
    label: 'YouTube',
    followersLabel: 'Subscribers',
    field: 'socialYoutube',
    prefix: 'youtube.com/@',
    placeholder: 'yourcompany',
    iconSlug: 'youtube',
    color: '#ff0000',
    profileUrl: urlFromHandle('youtube.com/@'),
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    followersLabel: 'Followers',
    field: 'socialTiktok',
    prefix: 'tiktok.com/@',
    placeholder: 'yourcompany',
    iconSlug: 'tiktok',
    color: '#ff0050',
    profileUrl: urlFromHandle('tiktok.com/@'),
  },
  {
    id: 'bluesky',
    label: 'Bluesky',
    followersLabel: 'Followers',
    field: 'socialBluesky',
    prefix: 'bsky.app/profile/',
    suffix: '.bsky.social',
    placeholder: 'yourcompany',
    iconSlug: 'bluesky',
    color: '#0085ff',
    profileUrl: urlFromHandle('bsky.app/profile/', '.bsky.social'),
  },
  {
    id: 'threads',
    label: 'Threads',
    followersLabel: 'Followers',
    field: 'socialThreads',
    prefix: 'threads.net/@',
    placeholder: 'yourcompany',
    iconSlug: 'threads',
    color: '#000000',
    profileUrl: urlFromHandle('threads.net/@'),
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    followersLabel: 'Followers',
    field: 'socialPinterest',
    prefix: 'pinterest.com/',
    placeholder: 'yourcompany',
    iconSlug: 'pinterest',
    color: '#bd081c',
    profileUrl: urlFromHandle('pinterest.com/'),
  },
  {
    id: 'snapchat',
    label: 'Snapchat',
    followersLabel: 'Followers',
    field: 'socialSnapchat',
    prefix: 'snapchat.com/add/',
    placeholder: 'yourcompany',
    iconSlug: 'snapchat',
    color: '#fffc00',
    profileUrl: urlFromHandle('snapchat.com/add/'),
  },
  {
    id: 'discord',
    label: 'Discord',
    followersLabel: 'Members',
    field: 'socialDiscord',
    prefix: 'discord.gg/',
    placeholder: 'yourinvite',
    iconSlug: 'discord',
    color: '#5865f2',
    profileUrl: urlFromHandle('discord.gg/'),
  },
  {
    id: 'reddit',
    label: 'Reddit',
    followersLabel: 'Members',
    field: 'socialReddit',
    prefix: 'reddit.com/r/',
    placeholder: 'yourcompany',
    handleCharset: 'A-Za-z0-9_',
    handleMaxLength: 21,
    iconSlug: 'reddit',
    color: '#ff4500',
    profileUrl: urlFromHandle('reddit.com/r/'),
  },
  {
    id: 'github',
    label: 'GitHub',
    followersLabel: 'Followers',
    field: 'socialGithub',
    prefix: 'github.com/',
    placeholder: 'yourcompany',
    iconSlug: 'github',
    color: '#181717',
    profileUrl: urlFromHandle('github.com/'),
  },
  {
    id: 'twitch',
    label: 'Twitch',
    followersLabel: 'Followers',
    field: 'socialTwitch',
    prefix: 'twitch.tv/',
    placeholder: 'yourcompany',
    iconSlug: 'twitch',
    color: '#9146ff',
    profileUrl: urlFromHandle('twitch.tv/'),
  },
  {
    id: 'telegram',
    label: 'Telegram',
    followersLabel: 'Members',
    field: 'socialTelegram',
    prefix: 't.me/',
    placeholder: 'yourcompany',
    iconSlug: 'telegram',
    color: '#26a5e4',
    profileUrl: urlFromHandle('t.me/'),
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    followersLabel: 'Contacts',
    field: 'socialWhatsapp',
    prefix: 'wa.me/',
    placeholder: '15551234567',
    iconSlug: 'whatsapp',
    color: '#25d366',
    profileUrl: urlFromHandle('wa.me/'),
  },
  {
    id: 'substack',
    label: 'Substack',
    followersLabel: 'Subscribers',
    field: 'socialSubstack',
    prefix: '',
    suffix: '.substack.com',
    placeholder: 'yourcompany',
    iconSlug: 'substack',
    color: '#ff6719',
    profileUrl: urlFromHandle('', '.substack.com'),
  },
  {
    id: 'yelp',
    label: 'Yelp',
    followersLabel: 'Reviews',
    field: 'socialYelp',
    prefix: 'yelp.com/biz/',
    placeholder: 'your-company',
    iconSlug: 'yelp',
    color: '#d32323',
    profileUrl: urlFromHandle('yelp.com/biz/'),
  },
  {
    id: 'googlebusiness',
    label: 'Google Business',
    followersLabel: 'Reviews',
    field: 'socialGoogleBusiness',
    prefix: 'maps.app.goo.gl/',
    placeholder: 'yourlink',
    iconSlug: 'google',
    color: '#4285f4',
    profileUrl: urlFromHandle('maps.app.goo.gl/'),
  },
];

const byId = new Map(SOCIAL_PLATFORM_CATALOG.map((p) => [p.id, p]));

export function getSocialPlatform(id: SocialPlatformId): SocialPlatformDef {
  const platform = byId.get(id);
  if (!platform) throw new Error(`Unknown social platform: ${id}`);
  return platform;
}

export function isSocialPlatformId(value: string): value is SocialPlatformId {
  return byId.has(value as SocialPlatformId);
}

export function parseHiddenSocialPlatforms(raw: unknown): SocialPlatformId[] {
  if (!Array.isArray(raw)) {
    if (typeof raw === 'string' && raw.trim()) {
      try {
        return parseHiddenSocialPlatforms(JSON.parse(raw));
      } catch {
        return [];
      }
    }
    return [];
  }
  const hidden = new Set<SocialPlatformId>();
  for (const item of raw) {
    if (typeof item === 'string' && isSocialPlatformId(item)) hidden.add(item);
  }
  return [...hidden];
}

/** Platforms that should render in the Socials settings form. */
export function visibleSocialPlatforms(
  hidden: SocialPlatformId[] | undefined | null,
): SocialPlatformDef[] {
  const hiddenSet = new Set(hidden ?? []);
  const visible = SOCIAL_PLATFORM_CATALOG.filter((p) => !hiddenSet.has(p.id));
  if (visible.length) return visible;
  return SOCIAL_PLATFORM_CATALOG.filter((p) => DEFAULT_VISIBLE_SOCIAL_PLATFORMS.includes(p.id));
}

/** JSON-safe catalog payload for the admin UI. */
export function socialPlatformCatalogForUi(): Array<
  Pick<
    SocialPlatformDef,
    | 'id'
    | 'label'
    | 'field'
    | 'prefix'
    | 'suffix'
    | 'placeholder'
    | 'handleCharset'
    | 'handleMaxLength'
    | 'iconSlug'
    | 'color'
  >
> {
  return SOCIAL_PLATFORM_CATALOG.map(
    ({
      id,
      label,
      field,
      prefix,
      suffix,
      placeholder,
      handleCharset,
      handleMaxLength,
      iconSlug,
      color,
    }) => ({
      id,
      label,
      field,
      prefix,
      suffix,
      placeholder,
      handleCharset,
      handleMaxLength,
      iconSlug,
      color,
    }),
  );
}
