/**
 * Official public mailbox for REΛVE (reave.app).
 *
 * Retired brand locals (hello@, support@, …) rewrite here so the website,
 * outbound From, VAPID subject, and company config stay on one address.
 * Personal / system mailboxes (thomas@, noreply@, inbound.*, demo.*) are left alone.
 */
export const REAVE_PUBLIC_EMAIL = 'get@reave.app';
export const REAVE_PUBLIC_HOST = 'reave.app';

const LEGACY_REAVE_PUBLIC_LOCALS = new Set([
  'hello',
  'support',
  'info',
  'contact',
  'hi',
  'team',
]);

export function isReaveAppHost(host: string): boolean {
  const h =
    host
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      ?.toLowerCase() || '';
  return h === REAVE_PUBLIC_HOST;
}

/** Rewrite retired REΛVE public mailboxes (hello@, support@, …) to get@reave.app. */
export function canonicalizeReaveBrandEmail(email: string): string {
  const trimmed = email.trim();
  if (!trimmed) return '';
  const mailto = /^mailto:/i.test(trimmed);
  const body = mailto ? trimmed.slice(7) : trimmed;
  const angle = body.match(/<([^>]+)>/);
  const addr = (angle ? angle[1] : body).trim().toLowerCase();
  const at = addr.lastIndexOf('@');
  if (at < 0) return trimmed;
  const local = addr.slice(0, at);
  const host = addr.slice(at + 1);
  if (host !== REAVE_PUBLIC_HOST || !LEGACY_REAVE_PUBLIC_LOCALS.has(local)) {
    return trimmed;
  }
  if (angle) {
    const replaced = body.replace(angle[1], REAVE_PUBLIC_EMAIL);
    return mailto ? `mailto:${replaced}` : replaced;
  }
  return mailto ? `mailto:${REAVE_PUBLIC_EMAIL}` : REAVE_PUBLIC_EMAIL;
}

export function defaultPublicEmailForDomain(
  domain: string,
  fallback: 'hello' | 'support' = 'hello',
): string {
  const host = domain.trim();
  if (!host) return '';
  if (isReaveAppHost(host)) return REAVE_PUBLIC_EMAIL;
  const apex = host
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .replace(/^www\./i, '')
    .split('/')[0];
  return apex ? `${fallback}@${apex}` : '';
}

/** Public contact address shown on the site, legal pages, and mailto: links. */
export function companyPublicEmail(
  company: { supportEmail?: string | null; domain?: string | null },
  fallback: 'hello' | 'support' = 'hello',
): string {
  const stored = canonicalizeReaveBrandEmail((company.supportEmail || '').trim());
  if (stored) return stored;
  return defaultPublicEmailForDomain(company.domain || '', fallback);
}
