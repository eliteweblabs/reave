/**
 * Extract one-time verification codes from inbound email (Resend inbox).
 * Used for copy-to-clipboard UX in the admin Email tab — not OS autofill.
 */

import { htmlToPlainText } from './emailBody';

export type VerificationCodeExtract = {
  /** Normalized code suitable for paste (digits only, or G-prefix stripped). */
  code: string;
};

const OTP_CONTEXT =
  /\b(?:verification|one[-\s]?time|security|login|sign[-\s]?in|access|auth(?:entication)?|confirm(?:ation)?|otp|passcode|pin)\s*(?:code|number|pin|password)?\b/i;

/** "482913 is your verification code" */
const LEADING_CODE = /\b(\d[\d\s-]{2,12}\d)\s+is\s+your\b/i;

/** "Your verification code is 482913" / "code: 482913" */
const CODE_AFTER_LABEL =
  /\b(?:code|password|pin|otp)\s*(?:is|:)\s*['"`]?([A-Z0-9][A-Z0-9\s-]{2,14})\b/i;

/** Google-style G-123456 */
const GOOGLE_CODE = /\b(G-\d{6})\b/i;

/** Standalone 6-digit near OTP wording (within ~100 chars). */
const NEAR_KEYWORD = new RegExp(
  String.raw`(?:verification|one[-\s]?time|security|login|sign[-\s]?in|access|auth|confirm|otp|passcode|pin)[\s\S]{0,100}?\b(\d{6})\b`,
  'i',
);

function plainBody(text?: string, html?: string): string {
  const t = (text ?? '').trim();
  if (t) return t;
  return html?.trim() ? htmlToPlainText(html) : '';
}

function normalizeCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const google = trimmed.match(/^G-(\d{6})$/i);
  if (google) return google[1];

  const compact = trimmed.replace(/[\s-]/g, '');
  if (/^\d{4,8}$/.test(compact)) {
    // Skip likely years when 4 digits.
    if (compact.length === 4 && /^20\d{2}$/.test(compact)) return null;
    return compact;
  }

  if (/^[A-Z0-9]{4,10}$/i.test(compact)) return compact.toUpperCase();

  return null;
}

function hasOtpContext(text: string): boolean {
  return OTP_CONTEXT.test(text) || LEADING_CODE.test(text);
}

function tryPatterns(text: string): VerificationCodeExtract | null {
  const attempts: RegExp[] = [GOOGLE_CODE, CODE_AFTER_LABEL, LEADING_CODE, NEAR_KEYWORD];
  for (const re of attempts) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const code = normalizeCode(m[1]);
    if (code) return { code };
  }
  return null;
}

/** Return a verification code when the message looks like an OTP email. */
export function extractVerificationCodeFromEmail(opts: {
  subject?: string;
  text?: string;
  html?: string;
}): VerificationCodeExtract | null {
  const subject = (opts.subject ?? '').trim();
  const body = plainBody(opts.text, opts.html);
  const combined = [subject, body].filter(Boolean).join('\n');
  if (!combined.trim()) return null;
  if (!hasOtpContext(combined)) return null;

  return tryPatterns(combined) ?? tryPatterns(body) ?? tryPatterns(subject);
}

export function isVerificationCodeEmail(opts: {
  subject?: string;
  text?: string;
  html?: string;
}): boolean {
  return extractVerificationCodeFromEmail(opts) != null;
}
