/**
 * emailForward.ts — forward an inbound email to a third-party address via Resend.
 *
 * Called by the inbound pipeline when a matched triage rule has `forwardTo` set.
 * The forwarded message preserves the original From/Subject and prepends a one-line
 * "Forwarded by REΛVE" banner so the recipient understands the context.
 */

import { sendEmail } from './outbound';
import type { InboundEmail } from './emailRules';
import { normalizeEmailBody } from './emailBody';
import { escapeHtml } from './htmlEscape';

export interface ForwardResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/**
 * Forward `email` to `forwardTo`.
 * - Subject is prefixed with "Fwd: " (unless already present).
 * - Body prepends a brief header line: original from + subject.
 * - Both plain-text and HTML variants are forwarded when available.
 */
export async function forwardEmail(
  email: InboundEmail,
  forwardTo: string,
): Promise<ForwardResult> {
  if (!forwardTo?.trim()) return { ok: false, error: 'forwardTo is empty' };

  const subject = email.subject ?? '(no subject)';
  const fwdSubject = /^fwd:/i.test(subject) ? subject : `Fwd: ${subject}`;

  const originalFrom = email.from ?? '(unknown sender)';
  const banner = `---------- Forwarded message ----------\nFrom: ${originalFrom}\nSubject: ${subject}\n\n`;

  const bodyText = normalizeEmailBody(email.text, email.html);
  const plainBody = banner + (bodyText || '(empty body)');

  let htmlBody: string | undefined;
  if (email.html) {
    const bannerHtml = `<div style="border-top:1px solid #ccc;margin:12px 0;padding-top:8px;font-size:13px;color:#555;">
<strong>---------- Forwarded message ----------</strong><br>
<strong>From:</strong> ${escapeHtml(originalFrom)}<br>
<strong>Subject:</strong> ${escapeHtml(subject)}
</div>`;
    htmlBody = bannerHtml + email.html;
  }

  const result = await sendEmail({
    to: forwardTo.trim(),
    subject: fwdSubject,
    text: plainBody,
    html: htmlBody,
  });

  if (result.ok) {
    console.info('[email-forward] forwarded', {
      from: originalFrom,
      subject,
      forwardTo,
      id: result.id,
    });
  } else {
    console.warn('[email-forward] forward failed', {
      from: originalFrom,
      subject,
      forwardTo,
      error: result.error,
    });
  }

  return result;
}

