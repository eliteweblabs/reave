/**
 * NFC /card login is phone + chip: the page already knows the number, Clerk
 * texts a one-time code, the person holding that phone types it.
 */

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
