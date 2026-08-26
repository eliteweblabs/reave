/**
 * Automatic Junk is Gmail-like: only a spam-filter hit, never AI "newsletter"
 * or an owner DELETE/Archive rule.
 */

export type SpamFilterHeaders = Record<string, string | undefined> | null | undefined;

function headerValue(headers: SpamFilterHeaders, name: string): string {
  if (!headers) return '';
  const want = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === want) return String(value ?? '');
  }
  return '';
}

function parseSpamScore(raw: string): number | null {
  const m = raw.trim().match(/^(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Conservative: only explicit vendor/spam-assassin flags, not body heuristics.
 * Score threshold 5 matches a typical SpamAssassin "is spam" cut.
 */
export function looksLikeSpamFilterHit(
  headers: SpamFilterHeaders,
  opts?: { knownContact?: boolean },
): { hit: boolean; detail?: string } {
  if (opts?.knownContact) return { hit: false };
  const flag = headerValue(headers, 'x-spam-flag').trim().toUpperCase();
  if (flag === 'YES') return { hit: true, detail: 'X-Spam-Flag: YES' };

  const status = headerValue(headers, 'x-spam-status').trim();
  if (/^yes\b/i.test(status)) return { hit: true, detail: `X-Spam-Status: ${status.slice(0, 80)}` };

  const scoreRaw = headerValue(headers, 'x-spam-score').trim();
  const score = parseSpamScore(scoreRaw);
  if (score != null && score >= 5) {
    return { hit: true, detail: `X-Spam-Score: ${score}` };
  }

  const ses = headerValue(headers, 'x-ses-spam-verdict').trim().toUpperCase();
  if (ses === 'FAIL') return { hit: true, detail: 'X-SES-Spam-Verdict: FAIL' };

  const auth = headerValue(headers, 'authentication-results').toLowerCase();
  if (/\bspam=(fail|yes)\b/.test(auth)) {
    return { hit: true, detail: 'Authentication-Results spam fail' };
  }

  return { hit: false };
}
