/** Clerk phone identifier (E.164). US 10-digit numbers become +1. */
export function cardPhoneToE164(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (trimmed.startsWith('+') && digits.length >= 10) return `+${digits}`;
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length === 10) return `+1${national}`;
  if (digits.length >= 10) return `+${digits}`;
  return '';
}

export function cardPhoneLast4(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  return digits.slice(-4);
}

function normalizeCardLoginHost(raw?: string | null): string {
  return (
    (raw ?? '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      ?.split(':')[0]
      ?.replace(/\.+$/, '')
      ?.replace(/^www\./, '') || ''
  );
}

/** Server-side FAPI proxy — only for *.reave.app satellites blocked by clerk-js. */
export function cardLoginUsesServerProxy(host?: string | null): boolean {
  const normalized = normalizeCardLoginHost(host);
  return Boolean(normalized.endsWith('.reave.app') && normalized !== 'reave.app');
}
