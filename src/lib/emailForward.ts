/**
 * Email forwarding helper for triage rules.
 *
 * When an email rule has a `forward_to` address, this module re-sends the
 * inbound message to that address via Resend immediately after the rule fires.
 * The forwarded message includes the original sender, subject, and body so the
 * recipient gets the full context without logging into REΛVE.
 */

import { sendEmail } from './outbound';
import { serverEnv } from './serverEnv';
import type { InboundEmail } from './emailRules';

export interface ForwardResult {
  ok: boolean;
  id?: string;
  error?: string;
  skipped?: boolean;
}

/**
 * Forward an inbound email to `forwardTo`.
 * Wraps the original body in a minimal "Forwarded message" envelope so the
 * recipient can see the original From/Subject without any REΛVE chrome.
 */
export async function forwardInboundEmail(
  email: InboundEmail,
  forwardTo: string,
): Promise<ForwardResult> {
  const forwardToClean = forwardTo.trim();
  if (!forwardToClean || !forwardToClean.includes('@')) {
    return { ok: false, error: 'forward_to is not a valid email address', skipped: true };
  }

  const key = serverEnv('RESEND_API_KEY')?.trim();
  if (!key) {
    return { ok: false, error: 'RESEND_API_KEY not set — cannot forward', skipped: true };
  }

  const originalFrom = email.from ?? '(unknown sender)';
  const originalSubject = email.subject ?? '(no subject)';
  const originalBody =
    email.text?.trim() ||
    (email.html ? '[HTML email — see attached HTML]' : '(empty body)');

  const forwardSubject = originalSubject.startsWith('Fwd:')
    ? originalSubject
    : `Fwd: ${originalSubject}`;

  const divider = '---------- Forwarded message ----------';
  const plainBody = [
    divider,
    `From: ${originalFrom}`,
    `Subject: ${originalSubject}`,
    '',
    originalBody,
  ].join('\n');

  const htmlBody = email.html
    ? `<p style="color:#888;font-size:12px;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:16px">
        &#8212;&#8212;&#8212; Forwarded message &#8212;&#8212;&#8212;<br>
        <b>From:</b> ${escapeHtml(originalFrom)}<br>
        <b>Subject:</b> ${escapeHtml(originalSubject)}
       </p>
       ${email.html}`
    : undefined;

  try {
    const result = await sendEmail({
      to: forwardToClean,
      subject: forwardSubject,
      text: plainBody,
      ...(htmlBody ? { html: htmlBody } : {}),
    });

    if (!result.ok) {
      console.warn('[email-forward] send failed', { forwardTo: forwardToClean, error: result.error });
      return { ok: false, error: result.error };
    }

    console.info('[email-forward] forwarded', {
      from: originalFrom,
      subject: originalSubject,
      forwardTo: forwardToClean,
      id: result.id,
    });

    return { ok: true, id: result.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[email-forward] exception', msg);
    return { ok: false, error: msg };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
