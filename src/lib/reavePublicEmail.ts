/**
 * Official public mailbox for reave.app (reave.app).
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

/** True when the address is a retired reave.app public mailbox (hello@, support@, …). */
export function isLegacyReavePublicEmail(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed) return false;
  return canonicalizeReaveBrandEmail(trimmed) !== trimmed;
}

/**
 * Patch to write into Admin → Company (`company_config`) on the official reave.app install.
 * Empty or retired public support mail becomes get@reave.app. Outbound From is only
 * rewritten when it is itself a retired public mailbox — noreply@ and personal stay.
 */
export function officialReavePublicEmailPatch(
  stored: { supportEmail?: string | null; fromEmail?: string | null } | null,
): { supportEmail?: string; fromEmail?: string } | null {
  const patch: { supportEmail?: string; fromEmail?: string } = {};
  const support = (stored?.supportEmail || '').trim();
  if (!support || isLegacyReavePublicEmail(support)) {
    patch.supportEmail = REAVE_PUBLIC_EMAIL;
  }
  const from = (stored?.fromEmail || '').trim();
  if (from && isLegacyReavePublicEmail(from)) {
    patch.fromEmail = REAVE_PUBLIC_EMAIL;
  }
  return Object.keys(patch).length ? patch : null;
}

/** Rewrite retired reave.app public mailboxes (hello@, support@, …) to get@reave.app. */
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
