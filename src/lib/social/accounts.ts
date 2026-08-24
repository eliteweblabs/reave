/**
 * Turn the company's stored social links into structured accounts the
 * dashboard can report on. Each stored value may be a full profile URL
 * (e.g. "https://x.com/reaveapp") or a bare handle ("@reaveapp"); both
 * normalize to a clean handle plus a canonical URL.
 */
import type { CompanyConfig } from '../companyConfig.ts';
import {
  SOCIAL_PLATFORM_CATALOG,
  composeSocialUrl,
  extractSocialHandle,
  type SocialPlatformAffix,
} from './platforms.ts';
import type { SocialAccount } from './types.ts';

export { SOCIAL_PLATFORM_CATALOG as SOCIAL_PLATFORMS } from './platforms.ts';
export { composeSocialUrl, extractSocialHandle } from './platforms.ts';

/** Extract a clean handle from a stored URL or bare handle string. */
export function parseHandle(raw: string, platform?: SocialPlatformAffix | null): string {
  return extractSocialHandle(raw, platform);
}

/** Accounts for every platform that has a non-empty handle configured. */
export function accountsFromCompany(company: CompanyConfig): SocialAccount[] {
  const accounts: SocialAccount[] = [];
  for (const meta of SOCIAL_PLATFORM_CATALOG) {
    const stored = String((company as Record<string, unknown>)[meta.field] ?? '');
    const handle = extractSocialHandle(stored, meta);
    if (!handle) continue;
    accounts.push({
      platform: meta.id,
      label: meta.label,
      handle,
      url: /^https?:\/\//i.test(stored.trim()) ? stored.trim() : composeSocialUrl(handle, meta),
      followersLabel: meta.followersLabel,
    });
  }
  return accounts;
}
