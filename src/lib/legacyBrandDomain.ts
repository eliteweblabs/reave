/**
 * reave.app → rekko.studio rebrand. Legacy zone hostnames 301 to the matching
 * rekko.studio host (path + query preserved): apex, www, and every subdomain.
 */

export const LEGACY_PUBLIC_BRAND_DOMAIN = 'reave.app';
export const CANONICAL_PUBLIC_BRAND_DOMAIN = 'rekko.studio';

export function normalizePublicHost(host: string): string {
  return String(host ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .split(':')[0]!;
}

/** True when the request Host is reave.app or *.reave.app. */
export function isLegacyReavePublicHost(host: string): boolean {
  const h = normalizePublicHost(host);
  return h === LEGACY_PUBLIC_BRAND_DOMAIN || h.endsWith(`.${LEGACY_PUBLIC_BRAND_DOMAIN}`);
}

/**
 * Map reave.app zone hosts to rekko.studio (demo.reave.app → demo.rekko.studio).
 * Returns null when the host is not on the legacy zone.
 */
export function mapLegacyReaveHostToRekko(host: string): string | null {
  const h = normalizePublicHost(host);
  if (h === LEGACY_PUBLIC_BRAND_DOMAIN) return CANONICAL_PUBLIC_BRAND_DOMAIN;
  if (h.endsWith(`.${LEGACY_PUBLIC_BRAND_DOMAIN}`)) {
    const sub = h.slice(0, -(LEGACY_PUBLIC_BRAND_DOMAIN.length + 1));
    return sub ? `${sub}.${CANONICAL_PUBLIC_BRAND_DOMAIN}` : CANONICAL_PUBLIC_BRAND_DOMAIN;
  }
  return null;
}

/** Official marketing / hub install — rekko.studio (and legacy apex while DNS still points here). */
export function isOfficialMarketingApexHost(host: string): boolean {
  const h = normalizePublicHost(host).replace(/^www\./, '');
  return h === CANONICAL_PUBLIC_BRAND_DOMAIN || h === LEGACY_PUBLIC_BRAND_DOMAIN;
}
