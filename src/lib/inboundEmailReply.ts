/**
 * Branded outbound replies threaded to inbound inbox messages.
 */

import type { EmailInboxRecord } from './emailInboxStore';
import {
  buildReplyEmailHeaders,
  buildReplySubject,
  quotedReplyHtmlFromText,
  resolveReplyRecipient,
  splitQuotedReplyBody,
} from './emailReply';
import { siteBaseUrl } from './contactApi';
import type { EmailInlineImage } from './emailComposeImages';
import { parseEmailShortcodes } from './emailShortcodes';
import { brandedEmailHtml, type EmailCta } from './emailTemplates';
import { logOutboundEmailForProject } from './logOutboundEmailForProject';
import { isEmailSendConfigured, sendEmail } from './outbound';

export type OutboundMail = { subject: string; text: string; html?: string };

export function scheduleFormUrl(
  baseUrl: string,
  prefill?: { name?: string | null; email?: string | null },
): string {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/form/schedule`);
  const name = prefill?.name?.trim();
  const email = prefill?.email?.trim();
  if (name) url.searchParams.set('name', name);
  if (email) url.searchParams.set('email', email);
  return url.toString();
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
  signature?: string;
  /** Pre-built HTML for the quoted original (reply threads). */
  quotedHtml?: string;
  /** CID inline images from compose paste/attach. */
  inlineImages?: EmailInlineImage[];
}): Promise<{ text: string; html: string }> {
  const firstName = firstNameFrom(opts.firstName);
  const { draft, quote } = splitQuotedReplyBody(opts.body);
  const parsed = parseEmailShortcodes(draft, { baseUrl: siteBaseUrl() });
  const paragraphs = parsed.plainText ? parsed.plainText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) : bodyParagraphs(draft);
  const signature = opts.signature?.trim() || '';
  const textParts = [`Hi ${firstName},`, '', ...paragraphs];
  if (signature) textParts.push('', signature);
  let text = textParts.join('\n\n');
  if (quote) text += quote.startsWith('\n') ? quote : `\n\n${quote}`;
  const quotedHtml = opts.quotedHtml?.trim() || (quote ? quotedReplyHtmlFromText(quote) : '');
  const html = await brandedEmailHtml({
    firstName,
    paragraphs,
    blocks: parsed.blocks,
    cta: opts.cta,
    note: opts.note,
    signature: signature || undefined,
    quotedHtml: quotedHtml || undefined,
    inlineImages: opts.inlineImages?.length ? opts.inlineImages : undefined,
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
    bodyText: message.text,
    bodyHtml: message.html ?? null,
  });

  return { ok: true, to, emailId: result.id };
}
