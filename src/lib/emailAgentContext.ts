import type { EmailInboxRecord } from './emailInboxStore';

/** Max body chars injected into agent prompts (full mail stays in DB / read_email_inbox). */
export const MAX_AGENT_EMAIL_BODY = 12_000;

function truncateForAgent(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated at ${max} chars — use read_email_inbox for full content]`;
}

function joinAddrs(addrs: string[] | undefined): string | null {
  if (!addrs?.length) return null;
  return addrs.join(', ');
}

function formatReceivedAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso || 'unknown';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso || 'unknown';
  }
}

/** Short reference shown in chat — subject, sender, and timestamp only. */
export function formatEmailChatReference(
  email: Pick<EmailInboxRecord, 'from' | 'subject' | 'receivedAt'>,
): string {
  return [
    `From: ${email.from || '(unknown)'}`,
    `Subject: ${email.subject || '(no subject)'}`,
    `Received: ${formatReceivedAt(email.receivedAt)}`,
  ].join('\n');
}

/** Body (+ optional summary) for agent prompts — skips headers already shown in chat. */
export function formatEmailBodyForAgent(
  email: Pick<EmailInboxRecord, 'bodyText' | 'bodySnippet' | 'summary'>,
  maxBody = MAX_AGENT_EMAIL_BODY,
): string {
  const body = email.bodyText?.trim() || email.bodySnippet?.trim() || '';
  const summary = email.summary?.trim() || '';
  if (summary && body && summary !== body && !body.startsWith(summary)) {
    return ['Summary:', summary, '', 'Body:', truncateForAgent(body, maxBody)].join('\n');
  }
  if (body) return truncateForAgent(body, maxBody);
  if (summary) return summary;
  return '(no body text)';
}

/** Chat-visible reference with a trimmed body preview. */
export function formatEmailChatReferenceWithBody(
  email: Pick<EmailInboxRecord, 'from' | 'subject' | 'receivedAt' | 'bodyText' | 'bodySnippet' | 'summary'>,
  maxBody = 4_000,
): string {
  const lines = [formatEmailChatReference(email), ''];
  const body = formatEmailBodyForAgent(email, maxBody);
  lines.push(body);
  return lines.join('\n');
}

/** Lean email context for the agent — metadata + trimmed body, no raw header dump. */
export function formatEmailForAgent(email: EmailInboxRecord, maxBody = MAX_AGENT_EMAIL_BODY): string {
  const lines = [
    `Message ID: ${email.id}`,
    `From: ${email.from || '(unknown)'}`,
  ];
  const to = joinAddrs(email.to);
  if (to) lines.push(`To: ${to}`);
  const replyTo = joinAddrs(email.replyTo);
  if (replyTo) lines.push(`Reply-To: ${replyTo}`);
  lines.push(`Subject: ${email.subject || '(no subject)'}`);
  if (email.category) lines.push(`Category: ${email.category}`);
  if (email.routeNote) lines.push(`Route: ${email.routeNote}`);
  lines.push('', formatEmailBodyForAgent(email, maxBody));
  return lines.join('\n');
}
