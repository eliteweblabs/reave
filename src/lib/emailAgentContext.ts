import type { EmailInboxRecord } from './emailInboxStore';
import {
  INBOX_EMAIL_CHAT_EXCERPT_MAX,
  INBOX_EMAIL_WAIT_INSTRUCTION,
} from './chatMessageFormat';
import {
  attachmentSummaryFallback,
  formatAttachmentListForPrompt,
} from './emailAttachments';

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

/** Short body preview for the inbox → agent chat handoff bubble. */
export function formatEmailChatExcerpt(
  email: Pick<EmailInboxRecord, 'bodyText' | 'bodySnippet' | 'summary'>,
  max = INBOX_EMAIL_CHAT_EXCERPT_MAX,
): string {
  const body = email.bodySnippet?.trim() || email.bodyText?.trim() || email.summary?.trim() || '';
  if (!body) return '';
  if (body.length <= max) return body;
  return `${body.slice(0, max)}…`;
}

/** User-visible stub when opening agent from the Email tab (full body stays in system context). */
export function buildInboxEmailOpenPrompt(
  email: Pick<
    EmailInboxRecord,
    'from' | 'subject' | 'receivedAt' | 'bodyText' | 'bodySnippet' | 'summary'
  >,
): string {
  const lines = [formatEmailChatReference(email), ''];
  const excerpt = formatEmailChatExcerpt(email);
  if (excerpt) lines.push(excerpt);
  lines.push('', INBOX_EMAIL_WAIT_INSTRUCTION);
  return lines.join('\n');
}

/** Body (+ optional summary) for agent prompts — skips headers already shown in chat. */
export function formatEmailBodyForAgent(
  email: Pick<EmailInboxRecord, 'bodyText' | 'bodySnippet' | 'summary' | 'attachments'>,
  maxBody = MAX_AGENT_EMAIL_BODY,
): string {
  const body = email.bodyText?.trim() || email.bodySnippet?.trim() || '';
  const summary = email.summary?.trim() || '';
  const attLines = formatAttachmentListForPrompt(email.attachments ?? []);
  const attBlock = attLines ? `\n\nAttachments:\n${attLines}` : '';
  if (summary && body && summary !== body && !body.startsWith(summary)) {
    return ['Summary:', summary, '', 'Body:', truncateForAgent(body, maxBody) + attBlock].join(
      '\n',
    );
  }
  if (body) return truncateForAgent(body, maxBody) + attBlock;
  if (attLines) {
    return (
      (summary ? `Summary:\n${summary}\n\n` : '') +
      `Attachments:\n${attLines}`
    );
  }
  if (summary) return summary;
  return attachmentSummaryFallback(email.attachments ?? []) || '(no body text)';
}

/** Chat-visible reference with a trimmed body preview. */
export function formatEmailChatReferenceWithBody(
  email: Pick<
    EmailInboxRecord,
    'from' | 'subject' | 'receivedAt' | 'bodyText' | 'bodySnippet' | 'summary' | 'attachments'
  >,
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
