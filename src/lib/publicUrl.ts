/** Normalize and validate public http(s) URLs (blocks localhost / private IPs). */

function isPrivateIpv4(a: number, b: number, _c: number, _d: number): boolean {
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 0) return true;
  return false;
}

export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h.endsWith('.internal')) return true;
  if (h === 'metadata.google.internal' || h.endsWith('.metadata.google.internal')) return true;
  if (h === '0.0.0.0') return true;

  const v4Mapped = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Mapped) return isPrivateHost(v4Mapped[1]);

  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const nums = v4.slice(1).map(Number);
    if (nums.some((n) => n > 255)) return true;
    return isPrivateIpv4(nums[0], nums[1], nums[2], nums[3]);
  }

  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;

  return false;
}

/** Validate a redirect Location header against private-network SSRF rules. */
export function resolvePublicRedirectUrl(
  location: string,
  baseUrl: string,
  preferHttps = false,
): URL | null {
  try {
    return normalizePublicUrl(new URL(location, baseUrl).toString(), preferHttps);
  } catch {
    return null;
  }
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

/**
 * Railway/Kinsta services that are backends, databases, or ops — not public
 * website frontends. Skip these for uptime monitoring.
 */
export function isInternalInfraService(label: string | null | undefined): boolean {
  if (!label) return false;
  const n = label.trim().toLowerCase();
  if (!n) return false;

  if (/(^|[\-_])(postgres|postgresql|mysql|mariadb|redis|mongo|memcached|database)([\-_]|$)/.test(n)) {
    return true;
  }
  if (/^(postgres|mysql|redis|mongo|mariadb|memcached)/.test(n)) return true;

  if (
    /^crater(-|$)/.test(n) ||
    n === 'contact-api' ||
    n === 'contact-postgres' ||
    n === 'reave-postgres' ||
    n === 'crater-mysql' ||
    n === 'calcom-booking-api' ||
    n === 'calcom-web-app' ||
    n === 'booking-api' ||
    /-booking-api$/.test(n)
  ) {
    return true;
  }

  if (/^plausible(-|$)/.test(n)) return true;

  return false;
}

/** True when a hostname is a public custom domain (not Railway's internal *.railway.app). */
export function isPublicWebsiteHost(host: string | null | undefined): boolean {
  const key = normalizeMonitorHost(host);
  if (!key) return false;
  if (isPrivateHost(key.split(':')[0] ?? key)) return false;
  if (key.endsWith('.up.railway.app') || key.endsWith('.railway.app')) return false;
  return true;
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
