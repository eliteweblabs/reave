/**
 * Validate redirect destinations to block open-redirect / XSS via Location headers.
 */

const BLOCKED_SCHEMES = /^(javascript|data|vbscript|file):/i;

export function isSafeRedirectDestination(destination: string): boolean {
  const raw = destination.trim();
  if (!raw) return false;
  if (BLOCKED_SCHEMES.test(raw)) return false;
  if (raw.startsWith('//')) return false;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  // Same-site relative paths only — no backslashes or control chars.
  if (!raw.startsWith('/')) return false;
  if (raw.includes('\\') || /[\0\r\n]/.test(raw)) return false;
  return true;
}

/** Append ?track= without changing the destination host/path semantics. */
export function redirectUrlWithTrack(
  destination: string,
  token: string,
  baseOrigin?: string,
): string | null {
  if (!isSafeRedirectDestination(destination)) return null;
  try {
    const base = destination.startsWith('http') ? undefined : baseOrigin;
    const url = new URL(destination, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.searchParams.set('track', token);
    return url.toString();
  } catch {
    if (!destination.startsWith('/')) return null;
    const sep = destination.includes('?') ? '&' : '?';
    return `${destination}${sep}track=${encodeURIComponent(token)}`;
  }
}
