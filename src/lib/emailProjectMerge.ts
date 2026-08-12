/**
 * Merge inbound email content into a project body with Claude — dedupe and synthesize,
 * not raw append.
 */

import { serverEnv } from './serverEnv';
import { isSleepModeActive } from './pushQuietHours';

export interface EmailMergeSource {
  from: string;
  subject: string;
  summary: string;
  bodySnippet: string;
  bodyText?: string;
  receivedAt: string;
}

function emailBodyForMerge(email: EmailMergeSource): string {
  return email.bodyText?.trim() || email.bodySnippet?.trim() || '';
}

function emailContextBlock(email: EmailMergeSource): string {
  const body = emailBodyForMerge(email);
  return [
    `From: ${email.from || '(unknown)'}`,
    `Subject: ${email.subject || '(no subject)'}`,
    `Received: ${email.receivedAt || 'unknown'}`,
    email.summary?.trim() ? `Summary: ${email.summary.trim()}` : '',
    body && body !== email.summary?.trim() ? `Body:\n${body}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function fallbackCreateBody(email: EmailMergeSource): string {
  const summary = email.summary?.trim() || emailBodyForMerge(email) || '';
  const lines = ['## Overview', ''];
  if (summary) lines.push(summary);
  else lines.push('_No summary available._');
  lines.push('', '## Source', '', `- **From:** ${email.from || '(unknown)'}`);
  lines.push(`- **Subject:** ${email.subject || '(no subject)'}`);
  if (email.receivedAt) lines.push(`- **Received:** ${email.receivedAt}`);
  return lines.join('\n').trim();
}

function fallbackMergeBody(existingBody: string, email: EmailMergeSource): string {
  const base = existingBody.trim();
  const incoming = email.summary?.trim() || emailBodyForMerge(email) || '';
  if (!incoming) return base;
  if (base.toLowerCase().includes(incoming.slice(0, 80).toLowerCase())) return base;
  const date = email.receivedAt
    ? new Date(email.receivedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'recent';
  const block = [`## Email update (${date})`, '', incoming].join('\n');
  return base ? `${base}\n\n${block}` : block;
}

function parseDollarAmount(raw: string): number | null {
  const n = Number(String(raw).replace(/[$,]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Pull a stated project budget from free text (email summary/body). */
export function extractBudgetFromText(text: string): number | null {
  const t = text.trim();
  if (!t) return null;

  const amounts: number[] = [];
  const budgetPatterns = [
    /(?:budget|project\s+(?:budget|value|cost)|quote|estimate|spend|invest|range)[^$\d]{0,48}\$?\s*([\d,]+(?:\.\d{2})?)/gi,
    /\$\s*([\d,]+(?:\.\d{2})?)\s*(?:\s*(?:budget|range|total|project|estimate|quote))/gi,
    /validate\s+\$?\s*([\d,]+(?:\.\d{2})?)\s*budget/gi,
  ];

  for (const re of budgetPatterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(t)) !== null) {
      const n = parseDollarAmount(match[1]);
      if (n) amounts.push(n);
    }
  }
  if (amounts.length) return Math.max(...amounts);

  return null;
}

function emailFullText(email: EmailMergeSource): string {
  return [email.summary, email.bodyText, email.bodySnippet, email.subject].filter(Boolean).join('\n');
}

const TITLE_MIN_WORDS = 2;
const TITLE_MAX_WORDS = 7;
const DEFAULT_PROJECT_TITLE = 'Project inquiry';

function normalizeTitleKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/^(?:re|fwd|fw)\s*:\s*/gi, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when `title` is just the email subject (including Re:/Fwd: variants). */
export function isEmailSubjectTitle(title: string, subject: string): boolean {
  const a = normalizeTitleKey(title);
  const b = normalizeTitleKey(subject);
  return Boolean(a && b && a === b);
}

/** Last-resort 2–7 word title from summary/body — never the raw subject line. */
export function fallbackProjectTitleFromEmail(email: EmailMergeSource): string {
  const raw =
    email.summary?.trim() || email.bodyText?.trim() || email.bodySnippet?.trim() || '';
  const stripped = raw
    .replace(
      /^(?:hi|hello|hey|dear|thanks|thank you|good morning|good afternoon)\b[\s,!]*/i,
      '',
    )
    .replace(/^[^a-z0-9]+/i, '')
    .trim();
  const words = stripped.split(/\s+/).filter(Boolean).slice(0, TITLE_MAX_WORDS);
  if (words.length >= TITLE_MIN_WORDS) {
    const candidate = words.join(' ').replace(/[.,;:!?]+$/, '');
    if (candidate && !isEmailSubjectTitle(candidate, email.subject)) return candidate;
  }
  return DEFAULT_PROJECT_TITLE;
}

/** Clamp an AI title to 2–7 words and reject copies of the email subject. */
export function normalizeGeneratedProjectTitle(
  raw: string | null | undefined,
  email: EmailMergeSource,
): string {
  const fallback = fallbackProjectTitleFromEmail(email);
  let t = String(raw ?? '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[.!?]+$/g, '')
    .trim();
  if (!t || isEmailSubjectTitle(t, email.subject)) return fallback;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < TITLE_MIN_WORDS) return fallback;
  if (words.length > TITLE_MAX_WORDS) t = words.slice(0, TITLE_MAX_WORDS).join(' ');
  return t;
}

/**
 * Prefer an explicit title only when it is not the email subject.
 * Otherwise use the generated 2–7 word summary.
 */
export function resolveNewProjectTitle(opts: {
  requestedTitle?: string | null;
  email: EmailMergeSource;
  generatedTitle?: string | null;
}): string {
  const requested = String(opts.requestedTitle ?? '').trim();
  if (requested && !isEmailSubjectTitle(requested, opts.email.subject)) {
    return requested;
  }
  return normalizeGeneratedProjectTitle(opts.generatedTitle, opts.email);
}

function parseMergeResponse(raw: string): {
  body: string;
  value: number | null;
  title: string | null;
} | null {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json|markdown|md)?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(trimmed) as { body?: unknown; value?: unknown; title?: unknown };
    if (typeof parsed.body !== 'string' || !parsed.body.trim()) return null;
    let value: number | null = null;
    if (parsed.value != null && parsed.value !== '') {
      const n = parseDollarAmount(String(parsed.value));
      if (n) value = n;
    }
    const title = typeof parsed.title === 'string' ? parsed.title.trim() : null;
    return { body: parsed.body.trim(), value, title };
  } catch {
    if (!trimmed) return null;
    return { body: trimmed, value: null, title: null };
  }
}

/** Apply extracted budget when the project has no value yet. */
export function pickMergedProjectValue(
  existing: number | null | undefined,
  extracted: number | null | undefined,
): number | null | undefined {
  if (extracted == null) return undefined;
  if (existing == null || existing === 0) return extracted;
  return undefined;
}

export type EmailProjectMergeResult = {
  body: string;
  value: number | null;
  usedAi: boolean;
  /** 2–7 word title from email content (new projects only). */
  suggestedTitle?: string;
};

export async function mergeEmailIntoProjectBody(opts: {
  existingBody: string;
  email: EmailMergeSource;
  projectTitle: string;
  isNewProject: boolean;
}): Promise<EmailProjectMergeResult> {
  const { existingBody, email, projectTitle, isNewProject } = opts;
  const regexValue = extractBudgetFromText(emailFullText(email));
  const hasRealTitle =
    Boolean(projectTitle.trim()) && !isEmailSubjectTitle(projectTitle, email.subject);

  const fallback = (): EmailProjectMergeResult => ({
    body: isNewProject ? fallbackCreateBody(email) : fallbackMergeBody(existingBody, email),
    value: regexValue,
    usedAi: false,
    suggestedTitle: isNewProject ? fallbackProjectTitleFromEmail(email) : undefined,
  });

  const key = serverEnv('ANTHROPIC_API_KEY')?.trim();
  if (!key) return fallback();
  if (await isSleepModeActive()) return fallback();

  const model = serverEnv('ANTHROPIC_MODEL')?.trim() || 'claude-sonnet-4-6';
  const jsonFooter = isNewProject
    ? 'Respond with ONLY valid JSON (no markdown fences): {"body":"<markdown notes>","value":8500,"title":"Homepage copy refresh"}\n' +
      '- body: markdown project notes as described above\n' +
      '- value: total project budget in USD as a number when clearly stated in the email (e.g. "$8,500 budget"), otherwise null\n' +
      '- title: 2–7 word project name summarizing the work requested from the email body/summary. Do NOT copy or lightly rephrase the email subject. Title Case, no quotes, no trailing period.'
    : 'Respond with ONLY valid JSON (no markdown fences): {"body":"<markdown notes>","value":8500}\n' +
      '- body: markdown project notes as described above\n' +
      '- value: total project budget in USD as a number when clearly stated in the email (e.g. "$8,500 budget"), otherwise null';

  const checkboxRules =
    '- Action items MUST use GitHub-flavored markdown checkboxes under a "## Action items" heading: `- [ ] Task description` (always unchecked when new).\n' +
    '- Do not use plain bullets for actionable tasks — only `- [ ]` / `- [x]` checkboxes.\n' +
    '- Preserve existing `[x]` checked state when merging; add new tasks as `- [ ]`.';

  const system = isNewProject
    ? `You write project notes for a web design/dev business. Given a new inbound client email, produce concise markdown project notes — NOT a transcript.
Use short sections only when they add clarity (e.g. Overview, Scope, Timeline, Budget, Open questions).
Extract facts: what they want, deadlines, budget, links, decisions, action items.
${checkboxRules}
Omit fluff, greetings, and duplicate lines.
Also write a short project title (2–7 words) that names the work itself — never the email subject line.
${jsonFooter}`
    : `You maintain project notes for a web design/dev business. Merge a new inbound email into EXISTING notes intelligently.
Rules:
- Integrate new facts into the right sections; update stale info when the email supersedes it.
- Do NOT append raw email dumps or growing "email log" sections.
- Deduplicate — if the email repeats what's already captured, make minimal or no changes.
- Keep notes scannable: bullets, short paragraphs, clear headings.
${checkboxRules}
- You may add one brief "Correspondence" line at the end with date + subject if useful for audit.
${jsonFooter}`;

  const user = isNewProject
    ? [
        hasRealTitle
          ? `Project title: ${projectTitle}`
          : 'Propose a 2–7 word project title from the email content. Do not use the Subject line.',
        '',
        'Inbound email:',
        emailContextBlock(email),
      ].join('\n')
    : [
        `Project title: ${projectTitle}`,
        '',
        '--- Existing project notes ---',
        existingBody.trim() || '(empty)',
        '',
        '--- New inbound email to merge ---',
        emailContextBlock(email),
      ].join('\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });

    if (!res.ok) {
      console.warn('[email-project-merge] anthropic error', res.status);
      return fallback();
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('\n')
      .trim();

    const parsed = parseMergeResponse(text);
    if (!parsed) return fallback();

    const value = parsed.value ?? regexValue;
    return {
      body: parsed.body,
      value,
      usedAi: true,
      suggestedTitle: isNewProject
        ? normalizeGeneratedProjectTitle(parsed.title, email)
        : undefined,
    };
  } catch (e) {
    console.warn('[email-project-merge] failed', e);
    return fallback();
  }
}

export function emailToMergeSource(ev: {
  from: string;
  subject: string;
  summary: string;
  bodySnippet: string;
  bodyText?: string;
  receivedAt: string;
}): EmailMergeSource {
  return {
    from: ev.from,
    subject: ev.subject,
    summary: ev.summary,
    bodySnippet: ev.bodySnippet,
    bodyText: ev.bodyText,
    receivedAt: ev.receivedAt,
  };
}
