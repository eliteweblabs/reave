/**
 * Merge inbound email content into a project body with Claude — dedupe and synthesize,
 * not raw append.
 */

import { serverEnv } from './serverEnv';

export interface EmailMergeSource {
  from: string;
  subject: string;
  summary: string;
  bodySnippet: string;
  receivedAt: string;
}

function emailContextBlock(email: EmailMergeSource): string {
  return [
    `From: ${email.from || '(unknown)'}`,
    `Subject: ${email.subject || '(no subject)'}`,
    `Received: ${email.receivedAt || 'unknown'}`,
    email.summary?.trim() ? `Summary: ${email.summary.trim()}` : '',
    email.bodySnippet?.trim() && email.bodySnippet.trim() !== email.summary?.trim()
      ? `Body excerpt:\n${email.bodySnippet.trim()}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function fallbackCreateBody(email: EmailMergeSource): string {
  const summary = email.summary?.trim() || email.bodySnippet?.trim() || '';
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
  const incoming = email.summary?.trim() || email.bodySnippet?.trim() || '';
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
  return [email.summary, email.bodySnippet, email.subject].filter(Boolean).join('\n');
}

function parseMergeResponse(raw: string): { body: string; value: number | null } | null {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json|markdown|md)?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(trimmed) as { body?: unknown; value?: unknown };
    if (typeof parsed.body !== 'string' || !parsed.body.trim()) return null;
    let value: number | null = null;
    if (parsed.value != null && parsed.value !== '') {
      const n = parseDollarAmount(String(parsed.value));
      if (n) value = n;
    }
    return { body: parsed.body.trim(), value };
  } catch {
    if (!trimmed) return null;
    return { body: trimmed, value: null };
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

export async function mergeEmailIntoProjectBody(opts: {
  existingBody: string;
  email: EmailMergeSource;
  projectTitle: string;
  isNewProject: boolean;
}): Promise<{ body: string; value: number | null; usedAi: boolean }> {
  const { existingBody, email, projectTitle, isNewProject } = opts;
  const regexValue = extractBudgetFromText(emailFullText(email));

  const fallback = () => ({
    body: isNewProject ? fallbackCreateBody(email) : fallbackMergeBody(existingBody, email),
    value: regexValue,
    usedAi: false,
  });

  const key = serverEnv('ANTHROPIC_API_KEY')?.trim();
  if (!key) return fallback();

  const model = serverEnv('ANTHROPIC_MODEL')?.trim() || 'claude-sonnet-4-6';
  const jsonFooter =
    'Respond with ONLY valid JSON (no markdown fences): {"body":"<markdown notes>","value":8500}\n' +
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
    ? [`Project title: ${projectTitle}`, '', 'Inbound email:', emailContextBlock(email)].join('\n')
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
    return { body: parsed.body, value, usedAi: true };
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
  receivedAt: string;
}): EmailMergeSource {
  return {
    from: ev.from,
    subject: ev.subject,
    summary: ev.summary,
    bodySnippet: ev.bodySnippet,
    receivedAt: ev.receivedAt,
  };
}
