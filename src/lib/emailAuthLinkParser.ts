/**
 * Detect magic / activation / one-click sign-in link emails and scrape the CTA URL.
 * Sibling to emailOtpParser — codes copy; links Activate-then-delete.
 */

import { htmlToPlainText } from './emailBody';
import { parseSenderEmailAddress } from './emailOtpParser';

export type AuthLinkExtract = {
  url: string;
};

export type AuthLinkEmailProbe = {
  from?: string;
  subject?: string;
  text?: string;
  html?: string;
};

/**
 * Routine "new login / new device" notices (Facebook, Instagram, GoDaddy, …).
 * These are not magic-link emails — they often say "log in" and include a
 * "secure your account" URL, which used to false-positive as AUTH_LINK and
 * fire a dashboard/push notification.
 */
const ROUTINE_NEW_LOGIN_NOTICE =
  /\b(?:did you just (?:log\s*in|sign[-\s]?in)|detected a new (?:sign[-\s]?in|login)|there'?s been a new sign[-\s]?in|new login to|(?:log(?:\s*in|ged[\s-]?in)|login) near|logged in(?:to)? your|(?:on|from) a new (?:device|browser)|login from a new)\b/i;

/** True when the message is a new-login / new-device notice, not a magic link. */
export function isRoutineNewLoginNotice(opts: AuthLinkEmailProbe): boolean {
  const hay = [opts.subject ?? '', opts.text ?? '', opts.html ?? '']
    .filter(Boolean)
    .join('\n');
  return ROUTINE_NEW_LOGIN_NOTICE.test(hay);
}

/** Strong activation / magic-link phrasing (not OTP digit codes). */
const AUTH_LINK_CONTEXT =
  /\b(?:magic\s+(?:sign[-\s]?in\s+)?link|activation\s+link|activate\s+(?:your\s+)?(?:account|email)|secure\s+link\s+to|one[-\s]?click\s+(?:sign[-\s]?in|log\s*in|login)|click\s+(?:here\s+)?to\s+(?:sign[-\s]?in|log\s*in|login|activate|verify|confirm)|sign[-\s]?in\s+link|login\s+link|verify\s+(?:your\s+)?email\s+by\s+clicking|confirm\s+(?:your\s+)?(?:email|account)\s+by\s+clicking|use\s+(?:this|the)\s+link\s+to\s+(?:sign[-\s]?in|log\s*in|login|activate)|your\s+(?:secure\s+)?(?:sign[-\s]?in|login|activation)\s+link)\b/i;

const AUTH_LINK_SUBJECT =
  /\b(?:secure\s+link|magic\s+link|activation\s+link|sign[-\s]?in\s+link|login\s+link|activate\s+your|verify\s+your\s+email|confirm\s+your\s+(?:email|account)|click\s+to\s+(?:sign|log)\s*in)\b/i;

/** CTA-ish anchor label text (auth only — not "Open TikTok" / social app buttons). */
const CTA_LABEL =
  /^(?:\s*(?:sign\s*[- ]?in|log\s*[- ]?in|login|activate|verify|confirm|continue|get\s+started|access\s+(?:your\s+)?account|click\s+here|tap\s+here)\s*)$/i;

const CTA_LABEL_LOOSE =
  /\b(?:sign\s*[- ]?in|log\s*[- ]?in|login|activate|verify\s+email|confirm\s+email|continue\s+to)\b/i;

/** Path / host hints that the href is the auth action. */
const AUTH_HREF =
  /(?:\/(?:login|log-in|signin|sign-in|sign_in|auth|authenticate|verify|verification|activate|activation|magic(?:-?link)?|session|sso|oauth|callback|confirm|invite)|[?&](?:token|magic|otp|code|auth)=)/i;

/**
 * Never treat these as the activation CTA.
 * Note: do NOT skip every URL containing `#` — Claude and others put the
 * magic-link nonce in the fragment (`…/magic-link#token`).
 */
const SKIP_HREF =
  /(?:unsubscribe|preferences|prefcenter|email-settings|manage[-_]?subscription|opt[-_]?out|privacy|terms|mailto:|javascript:|tel:|sms:|facebook\.com\/sharer|twitter\.com\/intent|linkedin\.com\/sharing|play\.google\.com|apps\.apple\.com)/i;

/** Static assets / tracking pixels — logos are often the first absolute URL in HTML mail. */
const STATIC_ASSET_HREF =
  /\.(?:png|jpe?g|gif|webp|svg|ico|bmp|avif|css|js|woff2?|ttf|eot|mp4|webm|pdf)(?:[?#]|$)/i;

const STATIC_ASSET_PATH =
  /\/(?:images?|img|static|assets|media|cdn-cgi|email-assets|icons?|logos?)\//i;

const BARE_URL =
  /https?:\/\/[^\s<>"')\]]+/gi;

function plainBody(text?: string, html?: string): string {
  const t = (text ?? '').trim();
  if (t) return t;
  return html?.trim() ? htmlToPlainText(html) : '';
}

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)));
}

function isStaticAssetUrl(url: string): boolean {
  if (STATIC_ASSET_HREF.test(url)) return true;
  try {
    const u = new URL(url);
    const path = u.pathname;
    if (STATIC_ASSET_PATH.test(path)) return true;
    // Bare logo/chip filenames without a clear auth path.
    if (/\b(?:logo|chip|pixel|spacer|beacon|tracking)\b/i.test(path) && !AUTH_HREF.test(url)) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Opaque nonce / hash typical of magic links (Claude uses `#token` fragments). */
function authTokenSignal(url: string): number {
  try {
    const u = new URL(url);
    const hash = u.hash.replace(/^#/, '');
    if (hash.length >= 8) {
      // Strong: non-empty fragment that looks like a token (not #pricing).
      if (/[A-Za-z0-9]{8,}/.test(hash) || /[:._\-*]/.test(hash)) return 60;
      if (hash.length >= 16) return 50;
    }
    const hay = `${u.pathname}${u.search}${hash ? `#${hash}` : ''}`;
    // Long opaque path/query segments (UUID, base64url, hex).
    if (
      /[A-Fa-f0-9]{24,}/.test(hay) ||
      /[A-Za-z0-9_-]{20,}/.test(hay) ||
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(hay)
    ) {
      return 35;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

function normalizeUrl(raw: string): string | null {
  const cleaned = decodeHtmlEntities(raw.trim())
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/[),.;]+$/g, '');
  if (!cleaned) return null;
  if (SKIP_HREF.test(cleaned)) return null;
  if (isStaticAssetUrl(cleaned)) return null;
  try {
    const u = new URL(cleaned);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.')) return null;
    // Drop empty / placeholder fragments only (`https://x.com/#`), keep real tokens.
    if (u.hash === '#' || u.hash === '#/') {
      u.hash = '';
    }
    if (isStaticAssetUrl(u.toString())) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function scoreHref(url: string, label = ''): number {
  let score = 0;
  if (AUTH_HREF.test(url)) score += 40;
  if (CTA_LABEL.test(label.trim())) score += 50;
  else if (CTA_LABEL_LOOSE.test(label)) score += 25;
  if (/claude\.ai|anthropic\.com|accounts\.google|clerk\.|auth0\.|okta\.|vercel\.com|github\.com|supabase\.|railway\.app/i.test(url)) {
    score += 15;
  }
  score += authTokenSignal(url);
  // Prefer longer opaque tokens (magic links) — but not image paths.
  try {
    const u = new URL(url);
    const path = u.pathname;
    if (path.length > 24 && !STATIC_ASSET_PATH.test(path)) score += 10;
    if (/[A-Za-z0-9_-]{16,}/.test(path + u.search + u.hash)) score += 10;
  } catch {
    /* ignore */
  }
  return score;
}

type Candidate = { url: string; score: number };

function collectHtmlAnchors(html: string): Candidate[] {
  const out: Candidate[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const attrs = m[1] ?? '';
    const inner = htmlToPlainText(m[2] ?? '').replace(/\s+/g, ' ').trim();
    const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i) ?? attrs.match(/\bhref\s*=\s*([^\s>]+)/i);
    const href = hrefMatch?.[2] ?? hrefMatch?.[1];
    if (!href) continue;
    const url = normalizeUrl(href);
    if (!url) continue;
    out.push({ url, score: scoreHref(url, inner) });
  }
  return out;
}

function collectBareUrls(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const m of text.matchAll(BARE_URL)) {
    const url = normalizeUrl(m[0] ?? '');
    if (!url) continue;
    out.push({ url, score: scoreHref(url) });
  }
  return out;
}

function pickBestUrl(candidates: Candidate[]): string | null {
  let best: Candidate | null = null;
  for (const c of candidates) {
    if (!best || c.score > best.score) best = c;
  }
  // Require some signal — bare marketing links without auth cues lose.
  if (!best || best.score < 25) return null;
  return best.url;
}

/** True when subject/body clearly describe a clickable auth / activation link. */
export function looksLikeAuthLinkEmail(opts: AuthLinkEmailProbe): boolean {
  const subject = (opts.subject ?? '').trim();
  const body = plainBody(opts.text, opts.html);
  const combined = [subject, body].filter(Boolean).join('\n');
  if (!combined.trim()) return false;
  // "Did you just log in near …" / "New login to Instagram" are notices, not CTAs.
  if (isRoutineNewLoginNotice(opts)) return false;
  if (AUTH_LINK_SUBJECT.test(subject) || AUTH_LINK_CONTEXT.test(combined)) return true;
  // CTA button + auth-ish subject without the long phrases (e.g. "Sign in to Claude").
  if (/\b(?:sign[-\s]?in|log\s*in|login|activate|verify)\b/i.test(subject) && extractAuthActionUrl(opts)) {
    return true;
  }
  return false;
}

/** Scrape the primary activation / magic sign-in URL from HTML or text. */
export function extractAuthActionUrl(opts: AuthLinkEmailProbe): AuthLinkExtract | null {
  const html = (opts.html ?? '').trim();
  const text = plainBody(opts.text, opts.html);
  const candidates: Candidate[] = [];
  if (html) candidates.push(...collectHtmlAnchors(html));
  if (text) candidates.push(...collectBareUrls(text));
  const url = pickBestUrl(candidates);
  return url ? { url } : null;
}

export function isAuthLinkEmail(opts: AuthLinkEmailProbe): boolean {
  if (!looksLikeAuthLinkEmail(opts)) return false;
  // Prefer messages where we can actually Activate; still classify without URL
  // so they never land in junk — UI falls back to View.
  return true;
}

function cleanPurposeTarget(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^["']+|["']+$/g, '')
    .trim()
    .slice(0, 72);
}

function senderDomain(from?: string): string {
  const email = parseSenderEmailAddress(from);
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1) : '';
}

/**
 * Human-readable label for what the activation link is for.
 */
export function describeAuthLinkPurpose(
  opts: AuthLinkEmailProbe,
  fallbackAppName?: string,
): string {
  const subject = (opts.subject ?? '').trim();
  const body = plainBody(opts.text, opts.html);
  const combined = [subject, body].filter(Boolean).join('\n');
  const app = (fallbackAppName ?? '').trim();
  const domain = senderDomain(opts.from);

  const magicTo =
    subject.match(/\bsecure\s+link\s+to\s+([A-Za-z0-9][A-Za-z0-9._+-]*(?:\.[A-Za-z]{2,})?)/i) ??
    combined.match(/\bsecure\s+link\s+to\s+([A-Za-z0-9][A-Za-z0-9._+-]*(?:\.[A-Za-z]{2,})?)/i) ??
    combined.match(/\bmagic\s+sign[-\s]?in\s+link\s+to\s+([A-Za-z0-9][A-Za-z0-9._+-]*(?:\.[A-Za-z]{2,})?)/i) ??
    combined.match(/\bsign[-\s]?in\s+link\s+to\s+([A-Za-z0-9][A-Za-z0-9._+-]*(?:\.[A-Za-z]{2,})?)/i);
  if (magicTo?.[1]) {
    const target = cleanPurposeTarget(magicTo[1]);
    // Skip bare emails — prefer product hostnames / brand tokens.
    if (target && !target.includes('@')) {
      return `Sign-in to ${target}`;
    }
  }

  if (/\bactivation\s+link\b/i.test(combined) || /\bactivate\s+your\s+account\b/i.test(combined)) {
    return app ? `Activate ${app}` : 'Account activation';
  }
  if (/\bverify\s+your\s+email\b/i.test(combined)) {
    return app ? `Verify email for ${app}` : 'Email verification';
  }
  if (/\bsign[-\s]?in\b/i.test(combined) || /\blog\s*in\b/i.test(combined)) {
    return app ? `Sign-in to ${app}` : 'Sign-in link';
  }

  if (/anthropic|claude/i.test(domain) || /claude/i.test(combined)) return 'Sign-in to Claude.ai';
  if (/clerk/i.test(domain)) return app ? `Sign-in to ${app}` : 'Clerk sign-in';
  if (/google/i.test(domain)) return 'Google sign-in';
  if (/github/i.test(domain)) return 'GitHub sign-in';
  if (/vercel/i.test(domain)) return 'Vercel sign-in';
  if (/supabase/i.test(domain)) return 'Supabase sign-in';
  if (/railway/i.test(domain)) return 'Railway sign-in';

  return app ? `Activation for ${app}` : 'Activation link';
}

export function formatAuthLinkPushNotification(opts: {
  purpose: string;
  hasUrl: boolean;
}): { title: string; body: string } {
  const purpose = opts.purpose.trim() || 'Activation link';
  const title = purpose;
  const body = opts.hasUrl
    ? 'Tap Activate to open the sign-in link — email deletes after use'
    : 'Open the Email tab for the sign-in link — auto-deletes soon';
  return { title, body };
}
