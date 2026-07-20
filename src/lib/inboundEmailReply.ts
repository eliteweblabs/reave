/**
 * Branded outbound replies threaded to inbound inbox messages.
 */

import type { EmailInboxRecord } from './emailInboxStore';
import { buildReplyEmailHeaders, buildReplySubject, resolveReplyRecipient } from './emailReply';
import { brandedEmailHtml, type EmailCta } from './emailTemplates';
import { logOutboundEmailForProject } from './logOutboundEmailForProject';
import { isEmailSendConfigured, sendEmail } from './outbound';

export type OutboundMail = { subject: string; text: string; html?: string };

export function scheduleFormUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/form/schedule`;
}

/** Split plain-text body into paragraphs; skip greeting/sign-off lines the template adds. */
function bodyParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function firstNameFrom(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0] || 'there';
}

/**
 * Wrap plain-text copy in the branded HTML template. Returns both text and html.
 */
export async function brandedPlainTextEmail(opts: {
  firstName: string;
  body: string;
  cta?: EmailCta;
  note?: string;
}): Promise<{ text: string; html: string }> {
  const firstName = firstNameFrom(opts.firstName);
  const paragraphs = bodyParagraphs(opts.body);
  const text = [`Hi ${firstName},`, '', ...paragraphs].join('\n\n');
  const html = await brandedEmailHtml({
    firstName,
    paragraphs,
    cta: opts.cta,
    note: opts.note,
  });
  return { text, html };
}

export async function sendInboundThreadReply(
  event: EmailInboxRecord,
  message: OutboundMail,
  opts?: {
    jobSlug?: string | null;
    contactUid?: string | null;
    source?: string;
    sentBy?: string | null;
  },
): Promise<{ ok: true; to: string; emailId?: string } | { ok: false; error: string }> {
  if (!isEmailSendConfigured()) {
    return { ok: false, error: 'Outbound email is not configured (RESEND_API_KEY)' };
  }
  const to = resolveReplyRecipient(event);
  if (!to.includes('@')) {
    return { ok: false, error: 'Could not determine reply recipient' };
  }
  const result = await sendEmail({
    to,
    subject: buildReplySubject(event.subject || message.subject),
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
    headers: buildReplyEmailHeaders(event),
  });
  if (!result.ok) return { ok: false, error: result.error };

  void logOutboundEmailForProject({
    toEmail: to,
    subject: buildReplySubject(event.subject || message.subject),
    resendId: result.id,
    sentBy: opts?.sentBy ?? null,
    source: opts?.source ?? 'inbound_reply',
    jobSlug: opts?.jobSlug ?? event.jobSlug,
    contactUid: opts?.contactUid ?? event.contactUid,
  });

  return { ok: true, to, emailId: result.id };
}
