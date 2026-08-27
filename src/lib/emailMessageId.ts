/** RFC 5322 Message-ID values are angle-bracketed. */
export function normalizeMessageId(raw: string): string {
  const id = raw.trim();
  if (!id) return '';
  if (id.startsWith('<') && id.endsWith('>')) return id;
  const inner = id.replace(/^<|>$/g, '');
  return inner ? `<${inner}>` : '';
}

/** All stored/search forms of a Message-ID (raw, bracketed, inner). */
export function messageIdLookupKeys(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const keys = new Set<string>([trimmed]);
  const normalized = normalizeMessageId(trimmed);
  if (normalized) keys.add(normalized);
  const inner = trimmed.replace(/^<|>$/g, '');
  if (inner) keys.add(inner);
  return [...keys];
}
