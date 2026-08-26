/**
 * Phrase extraction for owner Ignore / Learned email rules.
 * Kept free of store imports so verify scripts and emailRuleStore can share it.
 */

export type PhraseSource = {
  subject?: string | null;
  summary?: string | null;
  status?: string | null;
};

function tokenizeWords(blob: string): string[] {
  return blob
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Phrases for owner Ignore / Learned rules.
 * Prefer 2-word subject snippets so a single common word ("build", "services")
 * cannot DELETE or flag unrelated mail. Single tokens are a last resort and
 * only when they are long enough to be distinctive.
 */
export function extractPhrases(record: PhraseSource): string[] {
  const subject = String(record.subject || '').trim();
  const summary = String(record.summary || '').trim();
  const words = tokenizeWords([subject, summary].filter(Boolean).join(' '));

  const bigrams: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < words.length - 1 && bigrams.length < 3; i++) {
    const a = words[i];
    const b = words[i + 1];
    if (a.length < 3 || b.length < 3) continue;
    if (STOP_WORDS.has(a) || STOP_WORDS.has(b)) continue;
    const phrase = `${a} ${b}`;
    if (seen.has(phrase)) continue;
    seen.add(phrase);
    bigrams.push(phrase);
  }
  if (bigrams.length) return bigrams;

  const distinctive = [...new Set(words.filter((w) => w.length >= 8 && !STOP_WORDS.has(w)))].slice(
    0,
    3,
  );
  if (distinctive.length) return distinctive;

  const status = record.status?.trim();
  if (status && status !== 'UNMATCHED' && status.length >= 4) return [status.toLowerCase()];
  if (subject.length >= 8) return [subject.slice(0, 80).toLowerCase()];
  return ['inbound mail'];
}

/** Single-word token lists must all match; multi-word snippets may OR. */
export function triageRuleMatchMode(phrases: string[]): 'any' | 'all' {
  const clean = phrases.map((p) => String(p || '').trim()).filter(Boolean);
  if (clean.length <= 1) return 'any';
  const allSingleTokens = clean.every((p) => !/\s/.test(p) && !p.includes('@'));
  return allSingleTokens ? 'all' : 'any';
}

/** A short token with no spaces / @ — too broad for matchMode "any" on subject/body. */
export function isLooseSingleWordPhrase(phrase: string): boolean {
  const p = String(phrase || '').trim();
  if (!p || p.includes(' ') || p.includes('@')) return false;
  return true;
}

/**
 * Owner Ignore/Learned feedback used to store ["build","failed","demo"] with
 * matchMode any. One word in an unrelated footer then deleted or flagged mail.
 * Require every token when the rule is personal and every phrase is a single word.
 */
export function ruleNeedsAllModeForSingleWords(rule: {
  matchMode?: string;
  phrases?: string[];
  fields?: string[];
  scope?: string;
}): boolean {
  if (String(rule.matchMode || 'any') === 'all') return false;
  if (rule.scope === 'universal') return false;
  const fields = Array.isArray(rule.fields) ? rule.fields : [];
  if (fields.length === 1 && fields[0] === 'from') return false;
  const phrases = (rule.phrases || []).map((p) => String(p).trim()).filter(Boolean);
  if (!phrases.length) return false;
  if (!phrases.every(isLooseSingleWordPhrase)) return false;
  return phrases.length > 1 || phrases[0]!.length < 8;
}

export function tightenSingleWordAnyMatchRules<
  T extends { matchMode?: string; phrases?: string[]; fields?: string[]; scope?: string },
>(rules: T[]): { rules: T[]; changed: boolean } {
  let changed = false;
  const next = rules.map((r) => {
    if (!ruleNeedsAllModeForSingleWords(r)) return r;
    changed = true;
    return { ...r, matchMode: 'all' as const };
  });
  return { rules: next, changed };
}

const STOP_WORDS = new Set([
  'about',
  'after',
  'also',
  'and',
  'are',
  'been',
  'before',
  'but',
  'could',
  'email',
  'for',
  'from',
  'have',
  'https',
  'into',
  'just',
  'more',
  'not',
  'only',
  'our',
  'over',
  'please',
  'reply',
  'some',
  'subject',
  'than',
  'thank',
  'that',
  'the',
  'their',
  'then',
  'there',
  'these',
  'they',
  'this',
  'was',
  'were',
  'what',
  'when',
  'will',
  'with',
  'would',
  'you',
  'your',
]);
