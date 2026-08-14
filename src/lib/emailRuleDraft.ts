/**
 * Suggest a personal email-rule draft from the message that opened Email Lab
 * (dashboard notification → New rule). Keep in sync with
 * `suggestRuleDraftFromEmail` in public/admin/email-triage-lab.js.
 */

import type { MatchMode, RuleField } from './emailRules';

export type RuleDraftSource = {
  from?: string | null;
  fromName?: string | null;
  subject?: string | null;
  summary?: string | null;
  status?: string | null;
  bodyText?: string | null;
  text?: string | null;
  bodySnippet?: string | null;
  bodyHtml?: string | null;
  html?: string | null;
  detail?: string | null;
};

export type SuggestedRuleDraft = {
  title: string;
  description: string;
  phrases: string[];
  fields: RuleField[];
  matchMode: MatchMode;
};

const STOP_WORDS = new Set([
  'about',
  'after',
  'before',
  'could',
  'email',
  'from',
  'have',
  'https',
  'please',
  'reply',
  'subject',
  'thank',
  'that',
  'their',
  'there',
  'these',
  'this',
  'with',
  'would',
  'your',
]);

const GENERIC_SUBJECTS = new Set([
  'hi',
  'hello',
  'hey',
  'thanks',
  'thank you',
  'fyi',
  'following up',
  'follow up',
  'update',
  'quick update',
  'check in',
  'checking in',
  'reminder',
]);

export function parseFromAddress(raw: string): { name: string; email: string } {
  const value = String(raw || '').trim();
  const angle = value.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (angle) {
    return {
      name: angle[1].replace(/^["']|["']$/g, '').trim(),
      email: angle[2].trim().toLowerCase(),
    };
  }
  if (value.includes('@')) return { name: '', email: value.toLowerCase() };
  return { name: value, email: '' };
}

function stripMarkup(text: string): string {
  return String(text || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function sourceBody(record: RuleDraftSource): string {
  const candidates = [
    record.bodyText,
    record.text,
    record.bodySnippet,
    record.summary,
    record.detail,
  ];
  for (const raw of candidates) {
    const text = stripMarkup(String(raw || ''));
    if (text) return text;
  }
  return stripMarkup(String(record.bodyHtml || record.html || ''));
}

function cleanSubject(subject: string): string {
  return String(subject || '')
    .replace(/^(?:(?:re|fwd?|aw|sv|vs)\s*:\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSignalIds(blob: string): string[] {
  const matches =
    String(blob || '').match(
      /\b[A-Z]{2,}[-/#]?\d{2,}\b|\b(?:invoice|ticket|order|case|ref)[- #]*\d{3,}\b|#\d{3,}/gi,
    ) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of matches) {
    const phrase = match.replace(/\s+/g, ' ').trim();
    const key = phrase.toLowerCase();
    if (!phrase || seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
    if (out.length >= 3) break;
  }
  return out;
}

function distinctiveTokens(text: string, max: number): string[] {
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
  return [...new Set(words)].slice(0, max);
}

function isGenericSubject(subject: string): boolean {
  const key = subject.toLowerCase().replace(/[.!?]+$/g, '').trim();
  return !key || key.length < 8 || GENERIC_SUBJECTS.has(key);
}

export function suggestRuleDraftFromEmail(
  record: RuleDraftSource | null | undefined,
): SuggestedRuleDraft | null {
  if (!record || typeof record !== 'object') return null;
  const rawFrom = String(record.from || '').trim();
  const parsed = parseFromAddress(rawFrom);
  const fromName = String(record.fromName || '').trim() || parsed.name;
  const fromEmail = parsed.email;
  const subject = String(record.subject || '').trim();
  const cleaned = cleanSubject(subject);
  const body = sourceBody(record);
  if (!fromEmail && !cleaned && !body) return null;

  const phrases: string[] = [];
  const seen = new Set<string>();
  const pushPhrase = (value: string) => {
    const phrase = String(value || '').replace(/\s+/g, ' ').trim();
    const key = phrase.toLowerCase();
    if (!phrase || seen.has(key)) return;
    seen.add(key);
    phrases.push(phrase);
  };

  if (fromEmail) pushPhrase(fromEmail);
  for (const id of extractSignalIds(`${cleaned}\n${body}`)) pushPhrase(id);
  if (!isGenericSubject(cleaned) && cleaned.length <= 80) pushPhrase(cleaned);
  if (phrases.length < 3) {
    const tokenSource = isGenericSubject(cleaned) ? body : `${cleaned} ${body}`;
    for (const token of distinctiveTokens(tokenSource, 4)) pushPhrase(token);
  }

  if (!phrases.length) {
    const status = String(record.status || '').trim();
    if (status && status.toUpperCase() !== 'UNMATCHED') pushPhrase(status.toLowerCase());
    else pushPhrase('inbound mail');
  }

  const title = cleaned
    ? cleaned.slice(0, 60)
    : fromName
      ? `Mail from ${fromName}`
      : fromEmail
        ? `Mail from ${fromEmail}`
        : 'New rule';

  const descLines: string[] = [];
  if (rawFrom || fromEmail) descLines.push(`From: ${rawFrom || fromEmail}`);
  if (subject) descLines.push(`Subject: ${subject}`);
  const snippet = body.slice(0, 280);
  if (snippet) descLines.push('', snippet);

  return {
    title,
    description: descLines.join('\n'),
    phrases,
    fields: fromEmail ? ['from', 'subject', 'body'] : ['subject', 'body'],
    matchMode: 'any',
  };
}
