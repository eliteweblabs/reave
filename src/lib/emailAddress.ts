/** Extract bare email from RFC-style From headers. */
export function parseSenderEmail(from: string): string {
  const raw = from.trim();
  const angle = raw.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+$/.test(raw)) return raw.toLowerCase();
  return raw.toLowerCase();
}

/** Display name from RFC-style From headers, or empty when only an address. */
export function parseSenderName(from: string): string {
  const raw = from.trim();
  const named = raw.match(/^(.+?)\s*<[^>]+>$/);
  if (named?.[1]) return named[1].replace(/^["']|["']$/g, '').trim();
  if (/^[^\s@]+@[^\s@]+$/.test(raw)) return '';
  return raw.includes('@') ? '' : raw;
}
