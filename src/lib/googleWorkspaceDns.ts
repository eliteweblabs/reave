/**
 * Standard Google Workspace mail DNS (MX + SPF).
 * These records are public and identical for every Workspace domain —
 * never ask the user to paste them.
 *
 * @see https://support.google.com/a/answer/174125
 */

export type GoogleWorkspaceMx = {
  priority: number;
  content: string;
};

/** Five Google MX hosts. Priorities match Google Admin → Set up MX. */
export const GOOGLE_WORKSPACE_MX: readonly GoogleWorkspaceMx[] = [
  { priority: 1, content: 'aspmx.l.google.com' },
  { priority: 5, content: 'alt1.aspmx.l.google.com' },
  { priority: 5, content: 'alt2.aspmx.l.google.com' },
  { priority: 10, content: 'alt3.aspmx.l.google.com' },
  { priority: 10, content: 'alt4.aspmx.l.google.com' },
];

export const GOOGLE_SPF_INCLUDE = 'include:_spf.google.com';

export const GOOGLE_WORKSPACE_SPF = `v=spf1 ${GOOGLE_SPF_INCLUDE} ~all`;

export const GOOGLE_WORKSPACE_DMARC = 'v=DMARC1; p=none';

function normalizeMxHost(content: string): string {
  return content.trim().replace(/\.$/, '').toLowerCase();
}

export function isGoogleWorkspaceMx(content: string): boolean {
  const host = normalizeMxHost(content);
  return GOOGLE_WORKSPACE_MX.some((mx) => mx.content === host);
}

export function googleMxKey(priority: number, content: string): string {
  return `${priority}:${normalizeMxHost(content)}`;
}

/** True when SPF already authorizes Google Workspace. */
export function spfIncludesGoogle(spf: string): boolean {
  return /include:_spf\.google\.com/i.test(spf);
}

/**
 * Merge Google's SPF include into an existing record.
 * Preserves the existing `all` qualifier (~all / -all / +all / ?all).
 */
export function mergeGoogleSpf(existing: string | null | undefined): string {
  const raw = existing?.trim() ?? '';
  if (!raw) return GOOGLE_WORKSPACE_SPF;
  if (spfIncludesGoogle(raw)) return raw;

  const withAll = raw.replace(/\s+([~+\-?]?)all\s*$/i, ` ${GOOGLE_SPF_INCLUDE} $1all`);
  if (withAll !== raw) return withAll.replace(/\s+/g, ' ').trim();
  return `${raw} ${GOOGLE_SPF_INCLUDE}`.replace(/\s+/g, ' ').trim();
}

export function normalizeVerificationTxt(value: string): string {
  const trimmed = value.trim().replace(/^"+|"+$/g, '');
  if (!trimmed) return '';
  if (/^google-site-verification=/i.test(trimmed)) return trimmed;
  return `google-site-verification=${trimmed}`;
}
