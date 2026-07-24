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
  placeholder: string;
  /** Simple Icons slug for dashboard/settings UI. */
  iconSlug: string;
  /** Brand accent color (hex). */
  color: string;
  /** Build a canonical profile URL from a bare handle. */
  profileUrl: (handle: string) => string;
}

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

export const SOCIAL_PLATFORM_CATALOG: SocialPlatformDef[] = [
  {
    id: 'twitter',
    label: 'X / Twitter',
    followersLabel: 'Followers',
    field: 'socialTwitter',
    placeholder: 'https://x.com/yourcompany',
    iconSlug: 'x',
    color: '#1d9bf0',
    profileUrl: (h) => `https://x.com/${h}`,
  },
  {
    id: 'instagram',
    label: 'Instagram',
    followersLabel: 'Followers',
    field: 'socialInstagram',
    placeholder: 'https://instagram.com/yourcompany',
    iconSlug: 'instagram',
    color: '#e1306c',
    profileUrl: (h) => `https://instagram.com/${h}`,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    followersLabel: 'Followers',
    field: 'socialLinkedin',
    placeholder: 'https://linkedin.com/company/yourcompany',
    iconSlug: 'linkedin',
    color: '#0a66c2',
    profileUrl: (h) => `https://linkedin.com/company/${h}`,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    followersLabel: 'Followers',
    field: 'socialFacebook',
    placeholder: 'https://facebook.com/yourcompany',
    iconSlug: 'facebook',
    color: '#1877f2',
    profileUrl: (h) => `https://facebook.com/${h}`,
  },
  {
    id: 'youtube',
    label: 'YouTube',
    followersLabel: 'Subscribers',
    field: 'socialYoutube',
    placeholder: 'https://youtube.com/@yourcompany',
    iconSlug: 'youtube',
    color: '#ff0000',
    profileUrl: (h) => `https://youtube.com/@${h.replace(/^@/, '')}`,
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    followersLabel: 'Followers',
    field: 'socialTiktok',
    placeholder: 'https://tiktok.com/@yourcompany',
    iconSlug: 'tiktok',
    color: '#ff0050',
    profileUrl: (h) => `https://tiktok.com/@${h.replace(/^@/, '')}`,
  },
  {
    id: 'bluesky',
    label: 'Bluesky',
    followersLabel: 'Followers',
    field: 'socialBluesky',
    placeholder: 'https://bsky.app/profile/yourcompany.bsky.social',
    iconSlug: 'bluesky',
    color: '#0085ff',
    profileUrl: (h) => `https://bsky.app/profile/${h}`,
  },
  {
    id: 'threads',
    label: 'Threads',
    followersLabel: 'Followers',
    field: 'socialThreads',
    placeholder: 'https://threads.net/@yourcompany',
    iconSlug: 'threads',
    color: '#000000',
    profileUrl: (h) => `https://threads.net/@${h.replace(/^@/, '')}`,
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    followersLabel: 'Followers',
    field: 'socialPinterest',
    placeholder: 'https://pinterest.com/yourcompany',
    iconSlug: 'pinterest',
    color: '#bd081c',
    profileUrl: (h) => `https://pinterest.com/${h}`,
  },
  {
    id: 'snapchat',
    label: 'Snapchat',
    followersLabel: 'Followers',
    field: 'socialSnapchat',
    placeholder: 'https://snapchat.com/add/yourcompany',
    iconSlug: 'snapchat',
    color: '#fffc00',
    profileUrl: (h) => `https://snapchat.com/add/${h}`,
  },
  {
    id: 'discord',
    label: 'Discord',
    followersLabel: 'Members',
    field: 'socialDiscord',
    placeholder: 'https://discord.gg/yourinvite',
    iconSlug: 'discord',
    color: '#5865f2',
    profileUrl: (h) => (h.startsWith('http') ? h : `https://discord.gg/${h}`),
  },
  {
    id: 'reddit',
    label: 'Reddit',
    followersLabel: 'Members',
    field: 'socialReddit',
    placeholder: 'https://reddit.com/r/yourcompany',
    iconSlug: 'reddit',
    color: '#ff4500',
    profileUrl: (h) => (h.startsWith('http') ? h : `https://reddit.com/${h}`),
  },
  {
    id: 'github',
    label: 'GitHub',
    followersLabel: 'Followers',
    field: 'socialGithub',
    placeholder: 'https://github.com/yourcompany',
    iconSlug: 'github',
    color: '#181717',
    profileUrl: (h) => `https://github.com/${h}`,
  },
  {
    id: 'twitch',
    label: 'Twitch',
    followersLabel: 'Followers',
    field: 'socialTwitch',
    placeholder: 'https://twitch.tv/yourcompany',
    iconSlug: 'twitch',
    color: '#9146ff',
    profileUrl: (h) => `https://twitch.tv/${h}`,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    followersLabel: 'Members',
    field: 'socialTelegram',
    placeholder: 'https://t.me/yourcompany',
    iconSlug: 'telegram',
    color: '#26a5e4',
    profileUrl: (h) => `https://t.me/${h.replace(/^@/, '')}`,
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    followersLabel: 'Contacts',
    field: 'socialWhatsapp',
    placeholder: 'https://wa.me/15551234567',
    iconSlug: 'whatsapp',
    color: '#25d366',
    profileUrl: (h) => (h.startsWith('http') ? h : `https://wa.me/${h.replace(/\D/g, '')}`),
  },
  {
    id: 'substack',
    label: 'Substack',
    followersLabel: 'Subscribers',
    field: 'socialSubstack',
    placeholder: 'https://yourcompany.substack.com',
    iconSlug: 'substack',
    color: '#ff6719',
    profileUrl: (h) => (h.startsWith('http') ? h : `https://${h}.substack.com`),
  },
  {
    id: 'yelp',
    label: 'Yelp',
    followersLabel: 'Reviews',
    field: 'socialYelp',
    placeholder: 'https://yelp.com/biz/your-company',
    iconSlug: 'yelp',
    color: '#d32323',
    profileUrl: (h) => (h.startsWith('http') ? h : `https://yelp.com/biz/${h}`),
  },
  {
    id: 'googlebusiness',
    label: 'Google Business',
    followersLabel: 'Reviews',
    field: 'socialGoogleBusiness',
    placeholder: 'https://maps.app.goo.gl/yourlink',
    iconSlug: 'google',
    color: '#4285f4',
    profileUrl: (h) => (h.startsWith('http') ? h : `https://g.page/${h}`),
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
  Pick<SocialPlatformDef, 'id' | 'label' | 'field' | 'placeholder' | 'iconSlug' | 'color'>
> {
  return SOCIAL_PLATFORM_CATALOG.map(({ id, label, field, placeholder, iconSlug, color }) => ({
    id,
    label,
    field,
    placeholder,
    iconSlug,
    color,
  }));
}
