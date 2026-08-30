import { sanitizeEmailHtml } from './sanitizeEmailHtml';

export const MAX_STORED_EMAIL_BODY = 100_000;
export const MAX_STORED_EMAIL_HTML = 500_000;

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    // Drop images/SVGs without emitting alt text — logos and profile photos
    // are not excerpt-worthy and must not become the inbox preview.
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** True when a string is likely HTML markup (not accidental `<` in prose). */
export function looksLikeHtml(text: string): boolean {
  const t = text.trimStart();
  if (/^<!DOCTYPE\s/i.test(t) || /^<html[\s>]/i.test(t)) return true;
  return /^<[a-z!/]/i.test(t) && /<\/[a-z][^>]*>/i.test(t);
}

export function plainTextForDisplay(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return looksLikeHtml(trimmed) ? htmlToPlainText(trimmed) : trimmed;
}

/**
 * Multipart text/plain often pastes img alt text ("Acme logo") that never appears as
 * visible copy in the HTML. When HTML is available and the plain part is mostly that
 * chrome, prefer HTML→text (which drops &lt;img&gt; entirely).
 */
function textLooksLikeImageChrome(text: string): boolean {
  const original = text.replace(/\s+/g, ' ').trim();
  if (!original) return true;
  if (!/\b(?:logo|wordmark|profile\s+photo|\[image:)/i.test(original)) return false;
  const cleaned = stripImageChrome(original);
  if (!cleaned) return true;
  return cleaned.length < original.length * 0.55;
}

export function normalizeEmailBody(text?: string, html?: string, max = MAX_STORED_EMAIL_BODY): string {
  let body = (text ?? '').trim();
  const htmlPlain = html?.trim() ? htmlToPlainText(html) : '';
  if (!body && htmlPlain) {
    body = htmlPlain;
  } else if (body && looksLikeHtml(body)) {
    body = htmlToPlainText(body);
  } else if (body && htmlPlain && textLooksLikeImageChrome(body)) {
    body = htmlPlain;
  }
  if (!body) return '';
  if (body.length > max) return `${body.slice(0, max)}\n…[truncated at ${max} chars]`;
  return body;
}

function stripScriptTags(html: string): string {
  return sanitizeEmailHtml(html, { keepStyles: true });
}

/**
 * Force every anchor to open in a new browsing context (`target="_blank"` + `rel="noopener
 * noreferrer"`) instead of navigating in place. The inbox renders email HTML in a sandboxed
 * iframe; without this, a plain `<a href>` click navigates the sandboxed frame itself (or, if
 * the sandbox allows top navigation, the whole app shell) rather than escaping to the real
 * browser, which looks like the link "does nothing" and the app goes blank.
 */
function forceExternalLinks(html: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (match, attrs: string) => {
    if (!/\bhref\s*=/i.test(attrs)) return match;
    let next = attrs;
    next = /\btarget\s*=/i.test(next)
      ? next.replace(/\btarget\s*=\s*(["']).*?\1/i, 'target="_blank"')
      : `${next} target="_blank"`;
    const relMatch = next.match(/\brel\s*=\s*(["'])(.*?)\1/i);
    if (relMatch) {
      const quote = relMatch[1];
      const tokens = new Set(relMatch[2].split(/\s+/).filter(Boolean));
      tokens.add('noopener');
      tokens.add('noreferrer');
      next = next.replace(/\brel\s*=\s*(["']).*?\1/i, `rel=${quote}${Array.from(tokens).join(' ')}${quote}`);
    } else {
      next += ' rel="noopener noreferrer"';
    }
    return `<a${next}>`;
  });
}

/** Store inbound HTML for inbox rendering (scripts stripped). */
export function normalizeEmailHtml(
  text?: string,
  html?: string,
  max = MAX_STORED_EMAIL_HTML,
  opts?: { keepStyles?: boolean },
): string {
  let raw = (html ?? '').trim();
  if (!raw && text?.trim() && looksLikeHtml(text)) raw = text.trim();
  if (!raw) return '';
  raw = sanitizeEmailHtml(raw, { keepStyles: true, ...opts });
  if (raw.length > max) return `${raw.slice(0, max)}\n<!-- truncated -->`;
  return raw;
}

/** Store outbound HTML we authored — keep inline styles for the sent preview. */
export function normalizeSentEmailHtml(text?: string, html?: string, max = MAX_STORED_EMAIL_HTML): string {
  return normalizeEmailHtml(text, html, max, { keepStyles: true });
}

/** True when stored HTML still has author inline styles (not stripped on ingest). */
export function emailHtmlHasInlineStyles(html?: string): boolean {
  return /\bstyle\s*=/i.test(String(html || ''));
}

/** HTML to render in the inbox detail view (stored html, or legacy html-in-text fallback). */
export function resolveEmailHtmlForDisplay(bodyHtml?: string, bodyText?: string): string {
  const html = (bodyHtml ?? '').trim();
  if (html) return forceExternalLinks(stripScriptTags(html));
  const text = (bodyText ?? '').trim();
  if (text && looksLikeHtml(text)) return forceExternalLinks(stripScriptTags(text));
  return '';
}

/** Outbound mail we authored — keep inline styles so the sent preview matches the client. */
export function resolveSentEmailHtmlForDisplay(bodyHtml?: string, bodyText?: string): string {
  const html = (bodyHtml ?? '').trim();
  if (html) return forceExternalLinks(sanitizeEmailHtml(html, { keepStyles: true }));
  const text = (bodyText ?? '').trim();
  if (text && looksLikeHtml(text)) return forceExternalLinks(sanitizeEmailHtml(text, { keepStyles: true }));
  return '';
}

/** Whole-line image / decorative chrome from HTML-mail text/plain fallbacks. */
const IMAGE_CHROME_LINE =
  /^(?:\[(?:image:\s*)?[^\]]+\]|(?:the\s+)?[\w.&'’+-]+(?:\s+[\w.&'’+-]+){0,4}\s+)?(?:logo|wordmark|icon|badge|banner|header(?:\s+image)?|hero(?:\s+image)?|spacer|pixel|tracking(?:\s+pixel)?)$/i;

const PROFILE_CHROME_LINE =
  /^(?:your\s+)?(?:profile|user|account)\s+(?:photo|picture|image|avatar|headshot)$/i;

const BARE_IMAGE_LINE = /^(?:image|graphic|photo|picture|photo\s+\d+|image\s+\d+)$/i;

function lineWithoutUrls(line: string): string {
  return line
    .replace(/\(?https?:\/\/[^\s)]+\)?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isImageChromeLine(line: string): boolean {
  const t = line.replace(/\s+/g, ' ').trim();
  if (!t) return true;
  if (/^https?:\/\/\S+$/i.test(t)) return true;
  if (/^\(https?:\/\/[^)]+\)$/i.test(t)) return true;
  if (/^\[(?:image:\s*)[^\]]*\]$/i.test(t)) return true;
  if (/^\[[^\]]*\b(?:logo|icon|photo|picture|avatar|banner|spacer|pixel)[^\]]*\]$/i.test(t)) {
    return true;
  }
  const withoutUrl = lineWithoutUrls(t);
  if (!withoutUrl) return true;
  if (IMAGE_CHROME_LINE.test(withoutUrl) || PROFILE_CHROME_LINE.test(withoutUrl)) return true;
  if (BARE_IMAGE_LINE.test(withoutUrl)) return true;
  return false;
}

/**
 * Brand tokens before "logo" — no `.` so "started. Elevate logo" does not swallow
 * the preceding sentence (`.` would make "started." one token).
 */
const BRAND_TOKEN = String.raw`[\w&'’+-]+`;

/** Leading chrome tokens in an already-flattened snippet (stored rows). */
const LEADING_IMAGE_CHROME = new RegExp(
  String.raw`^(?:(?:your\s+)?(?:profile|user|account)\s+(?:photo|picture|image|avatar|headshot)|(?:the\s+)?(?:${BRAND_TOKEN}\s+){0,2}(?:logo|wordmark|icon|badge|banner|hero(?:\s+image)?|header(?:\s+image)?|spacer|pixel)|\[(?:image:\s*)[^\]]+\]|\[[^\]]*\b(?:logo|icon|photo|picture|banner|spacer|pixel)[^\]]*\]|\(?https?:\/\/[^\s)]+\)?)[\s,;:–—-]*`,
  'i',
);

/**
 * Img alt / screen-reader chrome that text/plain injects mid-body
 * (e.g. "…started. Elevate logo (https://link…) Welcome").
 * Also eats a following parenthetical or bare URL attached to that chrome.
 */
const INLINE_IMAGE_CHROME = new RegExp(
  String.raw`(?:^|[\s([{])((?:the\s+)?(?:${BRAND_TOKEN}\s+){0,3}(?:logo|wordmark)|(?:your\s+)?(?:profile|user|account)\s+(?:photo|picture|image|avatar|headshot)|\[(?:image:\s*)[^\]]*\]|\[[^\]]*\b(?:logo|icon|photo|picture|avatar|banner|spacer|pixel)[^\]]*\])(?:\s*\([^)]*\)?)?(?:\s*\(?https?:\/\/[^\s)]+\)?)?`,
  'gi',
);

function stripImageChrome(text: string): string {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && isImageChromeLine(lines[i])) i += 1;
  const fromLines = lines.slice(i).join('\n').trim();
  let rest = (fromLines || text).replace(/\s+/g, ' ').trim();
  let prev = '';
  while (rest && rest !== prev) {
    prev = rest;
    rest = rest.replace(LEADING_IMAGE_CHROME, '').trim();
  }
  prev = '';
  while (rest && rest !== prev) {
    prev = rest;
    rest = rest
      .replace(INLINE_IMAGE_CHROME, (match) => (/^[\s([{]/.test(match) ? match[0]! : ' '))
      .replace(/\s+/g, ' ')
      .replace(/\s+([.,;:!?])/g, '$1')
      .trim();
  }
  return rest;
}

export function inboxPreviewSnippet(text: string, max = 500): string {
  const source = plainTextForDisplay(text);
  const clean = stripImageChrome(source).replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** Inbox card / notification line — skip image chrome, then snippet, then subject. */
export function inboxListExcerpt(email: {
  summary?: string;
  bodySnippet?: string;
  bodyText?: string;
  subject?: string;
}): string {
  const summary = inboxPreviewSnippet(email.summary || '');
  if (summary) return summary;
  const snippet = inboxPreviewSnippet(email.bodySnippet || '');
  if (snippet) return snippet;
  const body = inboxPreviewSnippet(email.bodyText || '');
  if (body) return body;
  return String(email.subject || '').replace(/\s+/g, ' ').trim();
}
