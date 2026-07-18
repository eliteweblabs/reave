/**
 * Turn the company's stored social links into structured accounts the
 * dashboard can report on. Each stored value may be a full profile URL
 * (e.g. "https://x.com/reaveapp") or a bare handle ("@reaveapp"); both
 * normalize to a clean handle plus a canonical URL.
 */
import type { CompanyConfig } from '../companyConfig.ts';
import type { SocialAccount, SocialPlatformId } from './types.ts';

interface PlatformMeta {
  id: SocialPlatformId;
  label: string;
  followersLabel: string;
  /** Company-config field holding the stored link/handle. */
  field: keyof CompanyConfig;
  /** Build a canonical profile URL from a bare handle. */
  profileUrl: (handle: string) => string;
}

export const SOCIAL_PLATFORMS: PlatformMeta[] = [
  {
    id: 'twitter',
    label: 'X / Twitter',
    followersLabel: 'Followers',
    field: 'socialTwitter',
    profileUrl: (h) => `https://x.com/${h}`,
  },
  {
    id: 'instagram',
    label: 'Instagram',
    followersLabel: 'Followers',
    field: 'socialInstagram',
    profileUrl: (h) => `https://instagram.com/${h}`,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    followersLabel: 'Followers',
    field: 'socialLinkedin',
    profileUrl: (h) => `https://linkedin.com/company/${h}`,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    followersLabel: 'Followers',
    field: 'socialFacebook',
    profileUrl: (h) => `https://facebook.com/${h}`,
  },
  {
    id: 'youtube',
    label: 'YouTube',
    followersLabel: 'Subscribers',
    field: 'socialYoutube',
    profileUrl: (h) => `https://youtube.com/@${h.replace(/^@/, '')}`,
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    followersLabel: 'Followers',
    field: 'socialTiktok',
    profileUrl: (h) => `https://tiktok.com/@${h.replace(/^@/, '')}`,
  },
];

/** Extract a clean handle from a stored URL or bare handle string. */
export function parseHandle(raw: string): string {
  const value = (raw || '').trim();
  if (!value) return '';

  // Full URL → take the last meaningful path segment.
  if (/^https?:\/\//i.test(value) || value.includes('/')) {
    try {
      const url = new URL(value.startsWith('http') ? value : `https://${value}`);
      const segments = url.pathname.split('/').filter(Boolean);
      // "linkedin.com/company/foo" → "foo"; "x.com/foo" → "foo".
      const last = segments[segments.length - 1] || '';
      return last.replace(/^@/, '');
    } catch {
      /* fall through to bare-handle handling */
    }
  }

  return value.replace(/^@/, '');
}

/** Accounts for every platform that has a non-empty handle configured. */
export function accountsFromCompany(company: CompanyConfig): SocialAccount[] {
  const accounts: SocialAccount[] = [];
  for (const meta of SOCIAL_PLATFORMS) {
    const stored = String((company as Record<string, unknown>)[meta.field] ?? '');
    const handle = parseHandle(stored);
    if (!handle) continue;
    accounts.push({
      platform: meta.id,
      label: meta.label,
      handle,
      url: /^https?:\/\//i.test(stored.trim()) ? stored.trim() : meta.profileUrl(handle),
      followersLabel: meta.followersLabel,
    });
  }
  return accounts;
}
