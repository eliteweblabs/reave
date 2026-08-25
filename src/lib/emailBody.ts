import { sanitizeEmailHtml } from './sanitizeEmailHtml';

export const MAX_STORED_EMAIL_BODY = 100_000;
export const MAX_STORED_EMAIL_HTML = 500_000;

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
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

export function normalizeEmailBody(text?: string, html?: string, max = MAX_STORED_EMAIL_BODY): string {
  let body = (text ?? '').trim();
  if (!body && html?.trim()) {
    body = htmlToPlainText(html);
  } else if (body && looksLikeHtml(body)) {
    body = htmlToPlainText(body);
  }
  if (!body) return '';
  if (body.length > max) return `${body.slice(0, max)}\n…[truncated at ${max} chars]`;
  return body;
}

function stripScriptTags(html: string): string {
  return sanitizeEmailHtml(html);
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
  raw = sanitizeEmailHtml(raw, opts);
  if (raw.length > max) return `${raw.slice(0, max)}\n<!-- truncated -->`;
  return raw;
}

/** Store outbound HTML we authored — keep inline styles for the sent preview. */
export function normalizeSentEmailHtml(text?: string, html?: string, max = MAX_STORED_EMAIL_HTML): string {
  return normalizeEmailHtml(text, html, max, { keepStyles: true });
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

export function inboxPreviewSnippet(text: string, max = 500): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}
