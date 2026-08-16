/** Pure install-identity helpers — safe to import from verify scripts. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Bare address from `Name <addr@host>` or a plain email. */
export function parseEmailAddress(raw: string | null | undefined): string {
  const t = (raw ?? '').trim();
  if (!t) return '';
  const angle = t.match(/<([^>]+)>/);
  const candidate = (angle?.[1] || t).trim();
  return EMAIL_RE.test(candidate) ? candidate.toLowerCase() : '';
}

/**
 * Cal.com / booking-link username: lowercase alphanumeric, first DNS label
 * when the input looks like a host (`tonybarlettajr.com` → `tonybarlettajr`).
 */
export function slugifyCalcomUsername(raw: string | null | undefined): string {
  let s = (raw ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (s.includes('.')) s = s.split('.')[0] ?? s;
  return s.replace(/[^a-z0-9]+/g, '').slice(0, 30);
}
