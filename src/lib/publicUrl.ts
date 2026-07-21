/** Normalize and validate public http(s) URLs (blocks localhost / private IPs). */

export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '0.0.0.0') return true;

  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [, a, b] = v4.map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }

  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;

  return false;
}

export function normalizePublicUrl(raw: string, preferHttps = true): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (isPrivateHost(url.hostname)) return null;
    if (preferHttps && url.protocol === 'http:') {
      url.protocol = 'https:';
    }
    return url;
  } catch {
    return null;
  }
}

/**
 * Heuristic: does a label look like a non-production (staging/dev/preview)
 * environment or service, rather than a live site? Used to keep uptime
 * monitoring focused on production primary domains.
 */
export function isNonProductionLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return /(^|[\s\-_(./])(staging|stage|stg|dev|development|preview|test|testing|qa|demo|sandbox|template|tmp)([\s\-_)./]|$)/i.test(
    label,
  );
}

/** Hostname key for comparing monitor URLs across Kinsta, Railway, and UptimeRobot. */
export function normalizeMonitorHost(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let host = raw.trim().toLowerCase();
  host = host.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  const slash = host.indexOf('/');
  if (slash >= 0) host = host.slice(0, slash);
  return host || null;
}

export function normalizeDomain(raw: string): string | null {
  const trimmed = raw.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  if (!trimmed || trimmed.includes('/') || isPrivateHost(trimmed.split(':')[0] ?? trimmed)) return null;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase();
}
