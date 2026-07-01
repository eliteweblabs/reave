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

export async function mergeEmailIntoProjectBody(opts: {
  existingBody: string;
  email: EmailMergeSource;
  projectTitle: string;
  isNewProject: boolean;
}): Promise<{ body: string; usedAi: boolean }> {
  const { existingBody, email, projectTitle, isNewProject } = opts;
  const key = serverEnv('ANTHROPIC_API_KEY')?.trim();
  if (!key) {
    return {
      body: isNewProject
        ? fallbackCreateBody(email)
        : fallbackMergeBody(existingBody, email),
      usedAi: false,
    };
  }

  const model = serverEnv('ANTHROPIC_MODEL')?.trim() || 'claude-sonnet-4-6';
  const system = isNewProject
    ? `You write project notes for a web design/dev business. Given a new inbound client email, produce concise markdown project notes — NOT a transcript.
Use short sections only when they add clarity (e.g. Overview, Scope, Timeline, Budget, Open questions).
Extract facts: what they want, deadlines, budget, links, decisions, action items.
Omit fluff, greetings, and duplicate lines. Do not wrap in code fences.`
    : `You maintain project notes for a web design/dev business. Merge a new inbound email into EXISTING notes intelligently.
Rules:
- Output the FULL updated markdown body (not a diff).
- Integrate new facts into the right sections; update stale info when the email supersedes it.
- Do NOT append raw email dumps or growing "email log" sections.
- Deduplicate — if the email repeats what's already captured, make minimal or no changes.
- Keep notes scannable: bullets, short paragraphs, clear headings.
- You may add one brief "Correspondence" line at the end with date + subject if useful for audit.
Do not wrap in code fences.`;

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
      return {
        body: isNewProject
          ? fallbackCreateBody(email)
          : fallbackMergeBody(existingBody, email),
        usedAi: false,
      };
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('\n')
      .trim()
      .replace(/^```(?:markdown|md)?\n?/i, '')
      .replace(/\n?```$/i, '');

    if (!text) {
      return {
        body: isNewProject
          ? fallbackCreateBody(email)
          : fallbackMergeBody(existingBody, email),
        usedAi: false,
      };
    }

    return { body: text, usedAi: true };
  } catch (e) {
    console.warn('[email-project-merge] failed', e);
    return {
      body: isNewProject
        ? fallbackCreateBody(email)
        : fallbackMergeBody(existingBody, email),
      usedAi: false,
    };
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
