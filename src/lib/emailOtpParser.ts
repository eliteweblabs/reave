/**
 * Extract one-time verification codes from inbound email (Resend inbox).
 * Used for copy-to-clipboard UX in the admin Email tab — not OS autofill.
 *
 * Detection uses content regex first, then known OTP sender addresses/domains
 * (built-in list + optional EMAIL_OTP_SENDERS env).
 */

import { htmlToPlainText } from './emailBody';
import { serverEnv } from './serverEnv';

export type VerificationCodeExtract = {
  /** Normalized code suitable for paste (digits only, or G-prefix stripped). */
  code: string;
};

/** Strong OTP phrasing — avoid bare "access"/"pin" (footers, "shipping", etc.). */
const OTP_CONTEXT =
  /\b(?:verification(?:\s+code)?|one[-\s]?time(?:\s+(?:code|password|passcode))?|security\s+code|login\s+code|sign[-\s]?in\s+code|access\s+code|auth(?:entication)?\s+code|confirm(?:ation)?\s+code|otp|passcode|pin\s+code)\b/i;

/** OTP-ish subject lines from services that bury the code in HTML. */
const OTP_SUBJECT =
  /\b(?:verification\s+code|sign[-\s]?in\s+code|login\s+code|security\s+code|one[-\s]?time|otp|passcode|confirm(?:ation)?\s+code|your\s+code)\b/i;

/** "482913 is your verification code" */
const LEADING_CODE = /\b(\d[\d\s-]{2,12}\d)\s+is\s+your\b/i;

/** "Your verification code is 482913" / "code: 482913" — single-line capture only. */
const CODE_AFTER_LABEL =
  /\b(?:(?:verification|authentication|login|security|access)\s+code|one[-\s]?time(?:\s+password)?|passcode|otp|pin|code)\s*(?:is|:)\s*['"`]?([A-Z0-9][A-Z0-9 -]{1,12}[A-Z0-9])\b/i;

/** Google-style G-123456 */
const GOOGLE_CODE = /\b(G-\d{6})\b/i;

/** Standalone digit groups in short OTP mail from known senders. */
const LOOSE_DIGIT_CODE = /\b(\d{3}[\s-]+\d{3}|\d{2}(?:[\s-]+\d{2}){2}|\d{4,8})\b/g;

/**
 * Standalone / grouped digits near OTP wording (within ~120 chars).
 * Handles HTML that splits codes across spans ("931 348") and dashed forms.
 */
const NEAR_KEYWORD = new RegExp(
  String.raw`(?:verification|one[-\s]?time|security|login|sign[-\s]?in|access\s+code|auth(?:entication)?|confirm(?:ation)?\s+code|otp|passcode|pin\s+code)[\s\S]{0,120}?\b(\d{3}[\s-]+\d{3}|\d{2}(?:[\s-]+\d{2}){2}|\d{4,8})\b`,
  'i',
);

/** Local-part / domain heuristics for transactional OTP senders. */
const BUILTIN_OTP_SENDER_RES: RegExp[] = [
  /^no[-_.]?reply@/i,
  /^do[-_.]?not[-_.]?reply@/i,
  /^verify@/i,
  /^verification@/i,
  /^security@/i,
  /^otp@/i,
  /^auth(?:entication)?@/i,
  /^account[-.]?security@/i,
  /^sign[-.]?in@/i,
  /^login@/i,
  /^notify@/i,
  /^notification@/i,
  /^alert@/i,
  /@accounts\.google\.com$/i,
  /@googlemail\.com$/i,
  /@id\.apple\.com$/i,
  /@appleid\.apple\.com$/i,
  /@accountprotection\.microsoft\.com$/i,
  /@microsoft\.com$/i,
  /@amazon\.com$/i,
  /@facebookmail\.com$/i,
  /@linkedin\.com$/i,
  /@github\.com$/i,
  /@slack\.com$/i,
  /@stripe\.com$/i,
  /@twilio\.com$/i,
  /@uber\.com$/i,
  /@lyft\.com$/i,
  /@airbnb\.com$/i,
  /@dropbox\.com$/i,
  /@zoom\.us$/i,
  /@discord\.com$/i,
  /@coinbase\.com$/i,
  /@paypal\.com$/i,
  /@vercel\.com$/i,
  /@railway\.app$/i,
  /@supabase\.com$/i,
  /@clerk\.com$/i,
  /@resend\.dev$/i,
];

function plainBody(text?: string, html?: string): string {
  const t = (text ?? '').trim();
  if (t) return t;
  return html?.trim() ? htmlToPlainText(html) : '';
}

export function parseSenderEmailAddress(from?: string): string {
  const raw = String(from ?? '').trim();
  const angle = raw.match(/<([^>]+)>/);
  const email = (angle?.[1] ?? raw).trim().toLowerCase();
  return email.includes('@') ? email : '';
}

function customOtpSenderPatterns(): string[] {
  const raw = serverEnv('EMAIL_OTP_SENDERS');
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Known transactional OTP sender (built-in heuristics + EMAIL_OTP_SENDERS). */
export function isLikelyOtpSender(from?: string): boolean {
  const email = parseSenderEmailAddress(from);
  if (!email) return false;
  if (/^mailer-daemon@/i.test(email)) return false;

  for (const pat of customOtpSenderPatterns()) {
    if (pat.includes('@')) {
      if (email === pat) return true;
      continue;
    }
    if (email === pat || email.endsWith(`@${pat}`) || email.endsWith(`.${pat}`)) return true;
  }

  return BUILTIN_OTP_SENDER_RES.some((re) => re.test(email));
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

function pickBestCode(candidates: string[], minScore = 40): VerificationCodeExtract | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const code of candidates) {
    const score = scoreCode(code);
    if (score > bestScore) {
      best = code;
      bestScore = score;
    }
  }
  if (!best || bestScore < minScore) return null;
  return { code: best };
}

function tryPatterns(text: string, minScore = 40): VerificationCodeExtract | null {
  const candidates = [
    ...collectFromPattern(text, GOOGLE_CODE),
    ...collectFromPattern(text, CODE_AFTER_LABEL),
    ...collectFromPattern(text, LEADING_CODE),
    ...collectFromPattern(text, NEAR_KEYWORD),
  ];
  return pickBestCode(candidates, minScore);
}

/** Looser extraction when the sender is a known OTP address. */
function tryLooseSenderPatterns(text: string): VerificationCodeExtract | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 2000) return null;
  const candidates: string[] = [];
  for (const m of trimmed.matchAll(LOOSE_DIGIT_CODE)) {
    const code = normalizeCode(m[1] ?? '');
    if (code) candidates.push(code);
  }
  return pickBestCode(candidates, 40);
}

export type OtpEmailProbe = {
  from?: string;
  subject?: string;
  text?: string;
  html?: string;
};

/** True when content or sender strongly indicates a one-time code email. */
export function looksLikeOtpEmail(opts: OtpEmailProbe): boolean {
  const subject = (opts.subject ?? '').trim();
  const body = plainBody(opts.text, opts.html);
  const combined = [subject, body].filter(Boolean).join('\n');
  if (!combined.trim()) return false;
  if (extractVerificationCodeFromEmail(opts)) return true;
  if (isLikelyOtpSender(opts.from) && (OTP_SUBJECT.test(subject) || hasOtpContext(combined))) {
    return true;
  }
  return false;
}

/** Return a verification code when the message looks like an OTP email. */
export function extractVerificationCodeFromEmail(opts: OtpEmailProbe): VerificationCodeExtract | null {
  const subject = (opts.subject ?? '').trim();
  const body = plainBody(opts.text, opts.html);
  const combined = [subject, body].filter(Boolean).join('\n');
  if (!combined.trim()) return null;

  const senderLikelyOtp = isLikelyOtpSender(opts.from);
  const contentMatch = hasOtpContext(combined) || OTP_SUBJECT.test(subject);
  if (!contentMatch && !senderLikelyOtp) return null;

  const minScore = senderLikelyOtp && !contentMatch ? 40 : 40;
  const fromCombined = tryPatterns(combined, minScore);
  if (fromCombined) return fromCombined;
  const fromBody = tryPatterns(body, minScore);
  if (fromBody) return fromBody;
  const fromSubject = tryPatterns(subject, minScore);
  if (fromSubject) return fromSubject;

  if (senderLikelyOtp) {
    return tryLooseSenderPatterns(body) ?? tryLooseSenderPatterns(subject);
  }
  return null;
}

export function isVerificationCodeEmail(opts: OtpEmailProbe): boolean {
  return looksLikeOtpEmail(opts);
}
