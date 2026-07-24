/**
 * Turn the company's stored social links into structured accounts the
 * dashboard can report on. Each stored value may be a full profile URL
 * (e.g. "https://x.com/reaveapp") or a bare handle ("@reaveapp"); both
 * normalize to a clean handle plus a canonical URL.
 */
import type { CompanyConfig } from '../companyConfig.ts';
import { SOCIAL_PLATFORM_CATALOG } from './platforms.ts';
import type { SocialAccount } from './types.ts';

export { SOCIAL_PLATFORM_CATALOG as SOCIAL_PLATFORMS } from './platforms.ts';

/** Extract a clean handle from a stored URL or bare handle string. */
export function parseHandle(raw: string): string {
  const value = (raw || '').trim();
  if (!value) return '';

  // Full URL → take the last meaningful path segment.
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const segments = url.pathname.split('/').filter(Boolean);
      // "linkedin.com/company/foo" → "foo"; "x.com/foo" → "foo".
      const last = segments[segments.length - 1] || '';
      return last.replace(/^@/, '');
    } catch {
      /* fall through to bare-handle handling */
    }
  }

  // Path-like value without http:// prefix (e.g. "example.com/foo")
  if (value.includes('/')) {
    try {
      const url = new URL(`https://${value}`);
      const segments = url.pathname.split('/').filter(Boolean);
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
  for (const meta of SOCIAL_PLATFORM_CATALOG) {
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
