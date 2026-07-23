/** Normalize inbound email body for storage and agent context. */

export const MAX_STORED_EMAIL_BODY = 100_000;

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

export function inboxPreviewSnippet(text: string, max = 500): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}
