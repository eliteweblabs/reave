/** Extract bare email from RFC-style From headers. */
export function parseSenderEmail(from: string): string {
  const raw = from.trim();
  const angle = raw.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+$/.test(raw)) return raw.toLowerCase();
  return raw.toLowerCase();
}
