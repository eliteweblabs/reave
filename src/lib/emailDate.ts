/** Extract a header value case-insensitively. */
function headerValue(headers: Record<string, string> | undefined, name: string): string {
  if (!headers) return '';
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return String(v).trim();
  }
  return '';
}

/**
 * Parse the original send time from an email's Date header.
 * Returns null when missing or unparseable — callers should treat that as "arrived now".
 */
export function parseEmailDate(headers?: Record<string, string>): Date | null {
  const raw = headerValue(headers, 'date');
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
