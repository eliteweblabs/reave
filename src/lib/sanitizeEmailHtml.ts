/**
 * Server-side HTML sanitizer for inbound email bodies.
 * Strips scripts, active content, event handlers, and javascript: URLs.
 */
import { load } from 'cheerio';

const FORBIDDEN_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'meta',
  'link',
  'base',
  'frame',
  'frameset',
  'applet',
  'svg',
]);

const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'formaction', 'action', 'background']);

type HtmlElement = {
  tagName?: string;
  attribs?: Record<string, string>;
};

function isUnsafeUrl(value: string): boolean {
  const v = value.trim().replace(/\s+/g, '').toLowerCase();
  return (
    v.startsWith('javascript:') ||
    v.startsWith('vbscript:') ||
    v.startsWith('data:text/html') ||
    v.startsWith('data:application/')
  );
}

function isUnsafeCss(value: string): boolean {
  const v = value.replace(/\s+/g, '').toLowerCase();
  return (
    v.includes('javascript:') ||
    v.includes('vbscript:') ||
    v.includes('expression(') ||
    v.includes('behavior:') ||
    v.includes('-moz-binding')
  );
}

/** Sanitize inbound/stored email HTML for safe inbox rendering. */
export function sanitizeEmailHtml(html: string, opts?: { keepStyles?: boolean }): string {
  const trimmed = html.trim();
  if (!trimmed) return '';
  const keepStyles = opts?.keepStyles !== false;

  const $ = load(trimmed, null, false);

  FORBIDDEN_TAGS.forEach((tag) => {
    $(tag).remove();
  });

  $('*').each((_, rawEl) => {
    const el = rawEl as HtmlElement;
    const tag = el.tagName?.toLowerCase();
    if (tag && FORBIDDEN_TAGS.has(tag)) {
      $(rawEl).remove();
      return;
    }
    const attribs = el.attribs;
    if (!attribs) return;
    for (const [name, value] of Object.entries(attribs)) {
      const lower = name.toLowerCase();
      if (lower.startsWith('on')) {
        $(rawEl).removeAttr(name);
        continue;
      }
      if (lower === 'style') {
        if (!keepStyles || (typeof value === 'string' && isUnsafeCss(value))) {
          $(rawEl).removeAttr(name);
        }
        continue;
      }
      if (URL_ATTRS.has(lower) && typeof value === 'string' && isUnsafeUrl(value)) {
        $(rawEl).removeAttr(name);
      }
    }
  });

  return $.root().html()?.trim() ?? '';
}
