/**
 * Validate URLs before inserting into href attributes (XSS prevention).
 */

const UNSAFE_SCHEME_RE = /^(javascript|vbscript|data):/i;

/** True when href is safe for use in an anchor (http(s) or same-origin relative). */
export function isSafeLinkHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) return false;
  if (UNSAFE_SCHEME_RE.test(trimmed)) return false;
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('?') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../')
  ) {
    return !/[<>"']/.test(trimmed);
  }
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Escape a validated href for safe interpolation into an HTML attribute. */
export function safeLinkHrefAttr(href: string): string | null {
  if (!isSafeLinkHref(href)) return null;
  return href.replace(/"/g, '&quot;');
}
