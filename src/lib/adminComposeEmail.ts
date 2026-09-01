/**
 * Shared render path for admin compose send + preview.
 * Same branded HTML (including [center]/[button] shortcodes) in both cases.
 */

import type { APIContext } from 'astro';
import {
  resolveComposeImagesForSend,
  type EmailInlineImage,
  type EmailSendAttachment,
} from './emailComposeImages';
import { storeGetEmailInbox } from './emailInboxStore';
import {
  buildReplyEmailHeaders,
  formatQuotedReplyHtml,
  quotedReplyHtmlFromText,
  splitQuotedReplyBody,
} from './emailReply';
import { brandedPlainTextEmail } from './inboundEmailReply';
import { escapeHtml } from './htmlEscape';
import {
  appendSignatureToHtmlFragment,
  appendSignatureToPlainText,
  getUserEmailSignature,
  signatureHtmlForEmail,
} from './userEmailSignature';

/** Default true — branded wrapper unless compose explicitly turns it off. */
export function parseUseBrandedTemplate(raw: unknown): boolean {
  if (raw === false || raw === 0 || raw === '0' || raw === 'false') return false;
  return true;
}

function plainComposeEmail(opts: {
  body: string;
  signature?: string;
  quotedHtml?: string;
  inlineImages?: EmailInlineImage[];
}): { text: string; html: string } {
  const { draft, quote } = splitQuotedReplyBody(opts.body);
  const signature = opts.signature?.trim() || '';
  let text = draft;
  if (signature) text += `\n\n${signature}`;
  if (quote) text += quote.startsWith('\n') ? quote : `\n\n${quote}`;

  const paragraphs = draft.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const htmlParts: string[] = [];
  for (const p of paragraphs) {
    htmlParts.push(
      `<p style="margin:0 0 1em;font-family:sans-serif;font-size:14px;line-height:1.5;color:#111">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`,
    );
  }
  if (opts.inlineImages?.length) {
    for (const img of opts.inlineImages) {
      htmlParts.push(
        `<p style="margin:0 0 1em"><img src="cid:${escapeHtml(img.cid)}" alt="${escapeHtml(img.alt)}" style="max-width:100%;height:auto"></p>`,
      );
    }
  }
  if (signature) {
    htmlParts.push(`<div style="margin-top:1em">${signatureHtmlForEmail(signature)}</div>`);
  }
  const quotedHtml = opts.quotedHtml?.trim() || (quote ? quotedReplyHtmlFromText(quote) : '');
  if (quotedHtml) htmlParts.push(quotedHtml);

  return { text, html: htmlParts.join('\n') };
}

export type AdminComposeMail = {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  headers?: Record<string, string>;
  attachments: EmailSendAttachment[];
  jobSlug: string | null;
  contactUid: string | null;
  inReplyToEmailId: string | null;
};

export type AdminComposeBuildResult =
  | { ok: true; mail: AdminComposeMail }
  | { ok: false; error: string; status: number };

function normalizeList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v).trim()).filter(Boolean);
  }
  return String(raw ?? '')
    .split(/[,;]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function buildAdminComposeEmail(
  body: Record<string, unknown>,
  opts: {
    userId: string;
    context?: APIContext;
    requireRecipient?: boolean;
    requireSubject?: boolean;
  },
): Promise<AdminComposeBuildResult> {
  const requireRecipient = opts.requireRecipient !== false;
  const requireSubject = opts.requireSubject !== false;

  const to = normalizeList(body.to);
  const subject = String(body.subject ?? '').trim();
  const html = String(body.html ?? '').trim() || undefined;
  const text = String(body.text ?? body.body ?? '').trim();
  const useBrandedTemplate = parseUseBrandedTemplate(
    body.useBrandedTemplate ?? body.use_branded_template ?? body.branded,
  );
  const from = String(body.from ?? '').trim() || undefined;
  const cc = body.cc;
  const bcc = body.bcc;
  const inReplyToEmailId = String(body.inReplyToEmailId ?? body.in_reply_to_email_id ?? '').trim() || null;

  let composeImages: Awaited<ReturnType<typeof resolveComposeImagesForSend>>;
  try {
    composeImages = await resolveComposeImagesForSend(body.images);
  } catch (e) {
    return {
      ok: false,
      status: 400,
      error: e instanceof Error ? e.message : 'Could not load images',
    };
  }

  if (requireRecipient && !to.length) {
    return { ok: false, status: 400, error: 'Recipient (to) is required' };
  }
  if (requireSubject && !subject) {
    return { ok: false, status: 400, error: 'Subject is required' };
  }
  if (!text && !html && !composeImages.inline.length) {
    return { ok: false, status: 400, error: 'Message body is required' };
  }

  let jobSlug = String(body.jobSlug ?? body.job_slug ?? '').trim() || null;
  let contactUid = String(body.contactUid ?? body.contact_uid ?? '').trim() || null;
  let replyHeaders: Record<string, string> | undefined;
  let inbound: Awaited<ReturnType<typeof storeGetEmailInbox>> = null;

  if (inReplyToEmailId) {
    inbound = await storeGetEmailInbox(inReplyToEmailId);
    if (inbound) {
      replyHeaders = buildReplyEmailHeaders(inbound);
      jobSlug = jobSlug || inbound.jobSlug || null;
      contactUid = contactUid || inbound.contactUid || null;
    }
  }

  let sendText = text || html || '';
  let sendHtml = html;
  const signature = await getUserEmailSignature(opts.userId, opts.context);

  if ((!sendHtml && sendText && !/<[a-z][\s\S]*>/i.test(sendText)) || composeImages.inline.length) {
    const { quote } = splitQuotedReplyBody(sendText);
    const quotedHtml =
      quote && inbound
        ? formatQuotedReplyHtml({
            from: inbound.from,
            receivedAt: inbound.receivedAt,
            bodyHtml: inbound.bodyHtml,
            bodyText: inbound.bodyText,
          })
        : undefined;
    if (useBrandedTemplate) {
      const wrapped = await brandedPlainTextEmail({
        body: sendText,
        signature,
        quotedHtml,
        inlineImages: composeImages.inline,
      });
      sendText = wrapped.text;
      sendHtml = wrapped.html;
    } else {
      const plain = plainComposeEmail({
        body: sendText,
        signature,
        quotedHtml,
        inlineImages: composeImages.inline,
      });
      sendText = plain.text;
      sendHtml = plain.html;
    }
  } else {
    sendText = appendSignatureToPlainText(sendText, signature);
    if (sendHtml) sendHtml = appendSignatureToHtmlFragment(sendHtml, signature);
  }

  return {
    ok: true,
    mail: {
      to,
      subject,
      text: sendText,
      html: sendHtml,
      from,
      cc: typeof cc === 'string' || Array.isArray(cc) ? cc : undefined,
      bcc: typeof bcc === 'string' || Array.isArray(bcc) ? bcc : undefined,
      headers: replyHeaders,
      attachments: composeImages.attachments,
      jobSlug,
      contactUid,
      inReplyToEmailId: inbound ? inReplyToEmailId : null,
    },
  };
}
