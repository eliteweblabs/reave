/**
 * Extract one-time verification codes from inbound email (Resend inbox).
 * Used for copy-to-clipboard UX in the admin Email tab — not OS autofill.
 */

import { htmlToPlainText } from './emailBody';

export type VerificationCodeExtract = {
  /** Normalized code suitable for paste (digits only, or G-prefix stripped). */
  code: string;
};

/** Strong OTP phrasing — avoid bare "access"/"pin" (footers, "shipping", etc.). */
const OTP_CONTEXT =
  /\b(?:verification(?:\s+code)?|one[-\s]?time(?:\s+(?:code|password|passcode))?|security\s+code|login\s+code|sign[-\s]?in\s+code|access\s+code|auth(?:entication)?\s+code|confirm(?:ation)?\s+code|otp|passcode|pin\s+code)\b/i;

/** "482913 is your verification code" */
const LEADING_CODE = /\b(\d[\d\s-]{2,12}\d)\s+is\s+your\b/i;

/** "Your verification code is 482913" / "code: 482913" — single-line capture only. */
const CODE_AFTER_LABEL =
  /\b(?:(?:verification|authentication|login|security|access)\s+code|one[-\s]?time(?:\s+password)?|passcode|otp|pin|code)\s*(?:is|:)\s*['"`]?([A-Z0-9][A-Z0-9 -]{1,12}[A-Z0-9])\b/i;

/** Google-style G-123456 */
const GOOGLE_CODE = /\b(G-\d{6})\b/i;

/**
 * Standalone / grouped digits near OTP wording (within ~120 chars).
 * Handles HTML that splits codes across spans ("931 348") and dashed forms.
 */
const NEAR_KEYWORD = new RegExp(
  String.raw`(?:verification|one[-\s]?time|security|login|sign[-\s]?in|access\s+code|auth(?:entication)?|confirm(?:ation)?\s+code|otp|passcode|pin\s+code)[\s\S]{0,120}?\b(\d{3}[\s-]+\d{3}|\d{2}(?:[\s-]+\d{2}){2}|\d{4,8})\b`,
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

  // Alphanumeric OTPs: no whitespace in the raw capture (avoids "9MT2GE Gift").
  if (/\s/.test(trimmed)) return null;
  if (/^[A-Z0-9]{4,10}$/i.test(compact) && /\d/.test(compact) && /[A-Z]/i.test(compact)) {
    return compact.toUpperCase();
  }

  return null;
}

/** Higher is better — prefer standard 6-digit codes over short PINs / gift codes. */
function scoreCode(code: string): number {
  if (/^\d{6}$/.test(code)) return 100;
  if (/^\d{7,8}$/.test(code)) return 90;
  if (/^\d{5}$/.test(code)) return 70;
  if (/^\d{4}$/.test(code)) return 40;
  if (/^[A-Z0-9]{4,10}$/i.test(code) && /\d/.test(code)) return 45;
  return 0;
}

function hasOtpContext(text: string): boolean {
  return OTP_CONTEXT.test(text) || LEADING_CODE.test(text) || GOOGLE_CODE.test(text);
}

function collectFromPattern(text: string, re: RegExp): string[] {
  const out: string[] = [];
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  for (const m of text.matchAll(global)) {
    const code = normalizeCode(m[1] ?? '');
    if (code) out.push(code);
  }
  return out;
}

function pickBestCode(candidates: string[]): VerificationCodeExtract | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const code of candidates) {
    const score = scoreCode(code);
    if (score > bestScore) {
      best = code;
      bestScore = score;
    }
  }
  if (!best || bestScore < 40) return null;
  return { code: best };
}

function tryPatterns(text: string): VerificationCodeExtract | null {
  const candidates = [
    ...collectFromPattern(text, GOOGLE_CODE),
    ...collectFromPattern(text, CODE_AFTER_LABEL),
    ...collectFromPattern(text, LEADING_CODE),
    ...collectFromPattern(text, NEAR_KEYWORD),
  ];
  return pickBestCode(candidates);
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
