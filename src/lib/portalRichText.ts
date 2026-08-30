/**
 * Portal Overview body → safe HTML.
 *
 * Enrichment / admin paste often includes light markup (`<strong>`, `&#x27;`).
 * Escaping everything made those tags and entities show literally.
 */

import { escapeHtml } from './htmlEscape';

const ALLOWED = new Set([
  'strong',
  'em',
  'b',
  'i',
  'u',
  'br',
  'p',
  'ul',
  'ol',
  'li',
  'span',
  'a',
]);

function hasHtmlMarkup(s: string): boolean {
  return (
    /<\/?[a-z][\s\S]*?>/i.test(s) ||
    /&#(?:x[0-9a-f]+|\d+);/i.test(s) ||
    /&(?:amp|lt|gt|quot|apos|nbsp);/i.test(s)
  );
}

/** Escape text but keep numeric / named character references intact. */
function escapeTextPreserveEntities(text: string): string {
  return text
    .replace(/&(?!(?:#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url) || url.startsWith('/')) return url;
  return null;
}

function sanitizeTag(rawTag: string): string {
  const tag = rawTag.trim();
  const m = tag.match(/^<\/?\s*([a-z0-9]+)(\s[\s\S]*)?\s*\/?\s*>$/i);
  if (!m) return escapeHtml(tag);
  const name = m[1].toLowerCase();
  if (!ALLOWED.has(name)) return '';
  const closing = /^<\s*\//.test(tag);
  if (name === 'br') return '<br />';
  if (closing) return `</${name}>`;
  if (name === 'a') {
    const hrefMatch = tag.match(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = safeHref(hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? '');
    if (!href) return '';
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">`;
  }
  return `<${name}>`;
}

function autolink(html: string): string {
  // Avoid rewriting URLs already inside href="..."
  return html.replace(/(^|[^"'>])(https?:\/\/[^\s<]+)/g, (_m, pre: string, url: string) => {
    return `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}

/**
 * Render portal Overview body for `set:html`.
 * Plain text → escape + autolink + `<br />`.
 * Light HTML / entities → keep safe tags, preserve character references.
 */
export function portalRichText(raw: string): string {
  const s = String(raw ?? '');
  if (!s) return '';

  if (!hasHtmlMarkup(s)) {
    return autolink(escapeHtml(s)).replace(/\n/g, '<br />');
  }

  const parts = s.split(/(<[^>]+>)/g);
  let html = '';
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('<') && part.endsWith('>')) {
      html += sanitizeTag(part);
    } else {
      html += escapeTextPreserveEntities(part).replace(/\n/g, '<br />');
    }
  }
  return autolink(html);
}

/** Strip tags/entities for storage when we want plain overview copy. */
export function stripPortalHtml(raw: string): string {
  return String(raw ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;|&apos;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
