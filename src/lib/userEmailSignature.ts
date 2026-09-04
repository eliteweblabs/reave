/**
 * Per-user outgoing email signature — stored on Clerk publicMetadata
 * (Admin → Profile), not company settings.
 */
import type { APIContext } from 'astro';
import * as cheerio from 'cheerio';
import { clerkClient } from '@clerk/astro/server';
import { clerkSecretKey } from './clerkClient';
import { escHtml } from './escHtml';

export const SIG_IMG_MAX_WIDTH = 160;
export const SIG_IMG_MAX_HEIGHT = 64;
const SIG_LOGO_WRAP_STYLE = 'margin:0;padding:0;line-height:0';
const SIG_TEXT_BLOCK_STYLE = 'margin:0;padding:0;line-height:1.45';

function parsePx(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = parseInt(String(raw).replace(/px$/i, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Display size for signature logos — matches the editor preview box. */
export function clampSignatureImageSize(
  width: number,
  height: number,
): { width: number; height: number } {
  if (!width || !height) {
    return { width: SIG_IMG_MAX_WIDTH, height: Math.round(SIG_IMG_MAX_HEIGHT * 0.5) };
  }
  const scale = Math.min(SIG_IMG_MAX_WIDTH / width, SIG_IMG_MAX_HEIGHT / height, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function signatureImageEmailStyle(width: number): string {
  return `display:block;margin:0 0 6px 0;width:${width}px;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none`;
}

/** Email clients honor width/height attributes — CSS max-width alone is ignored. */
function applySignatureImageEmailAttrs($img: cheerio.Cheerio<cheerio.Element>): void {
  const attrW = parsePx($img.attr('width'));
  const attrH = parsePx($img.attr('height'));
  let width = attrW;
  let height = attrH;

  if (!width || !height) {
    const style = $img.attr('style') || '';
    const maxW = style.match(/(?:^|;\s*)max-width:\s*(\d+)px/i);
    width = width || parsePx(maxW?.[1]) || SIG_IMG_MAX_WIDTH;
    height = height || Math.round(width * 0.4);
  }

  const sized = clampSignatureImageSize(width!, height!);
  $img
    .removeAttr('class')
    .attr('width', String(sized.width))
    .attr('height', String(sized.height))
    .attr('style', signatureImageEmailStyle(sized.width));
}

async function fetchClerkUserPublicMetadata(userId: string): Promise<Record<string, string>> {
  const secretKey = clerkSecretKey();
  if (!secretKey) return {};
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) return {};
    const data = (await res.json()) as Record<string, unknown>;
    return ((data.public_metadata ?? {}) as Record<string, string>) || {};
  } catch {
    return {};
  }
}

/** Plain-text signature saved on the signed-in user's Clerk profile. */
export async function getUserEmailSignature(
  userId: string | null | undefined,
  context?: APIContext,
): Promise<string> {
  const id = userId?.trim();
  if (!id) return '';
  try {
    if (context) {
      const user = await clerkClient(context).users.getUser(id);
      const meta = (user.publicMetadata ?? {}) as Record<string, string>;
      return (meta.emailSignature ?? '').trim();
    }
    const meta = await fetchClerkUserPublicMetadata(id);
    return (meta.emailSignature ?? '').trim();
  } catch {
    return '';
  }
}

export function isHtmlSignature(signature: string): boolean {
  return /<[a-z][\s\S]*>/i.test(signature.trim());
}

/** Strip scripts and inline handlers from admin-authored signature HTML. */
export function sanitizeSignatureHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(?:iframe|object|embed|form|meta|link|base|svg|math)[\s>]/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*["']\s*(javascript|vbscript|data):[^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/vbscript:/gi, '')
    .trim();
}

export function signatureToPlainText(signature: string): string {
  const trimmed = signature.trim();
  if (!trimmed) return '';
  if (!isHtmlSignature(trimmed)) return trimmed;
  return trimmed
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr)>/gi, '\n')
    .replace(/<img[^>]*alt=["']([^"']*)["'][^>]*>/gi, (_, alt) => (alt ? `[${alt}]` : '[Logo]'))
    .replace(/<img[^>]*>/gi, '[Logo]')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isEmptySignatureBlock($: cheerio.CheerioAPI, el: cheerio.Element): boolean {
  const $el = $(el);
  if ($el.find('img').length) return false;
  const text = $el.text().replace(/\u00a0/g, ' ').trim();
  if (text) return false;
  const inner = ($el.html() || '').replace(/\s/g, '').toLowerCase();
  return !inner || /^(<br\s*\/?>)+$/i.test(inner);
}

/**
 * Tighten contenteditable markup for email clients — figures/divs/br-only rows
 * pick up large default margins in Gmail and Apple Mail.
 */
export function normalizeSignatureHtmlForEmail(html: string): string {
  const cleaned = sanitizeSignatureHtml(html);
  if (!cleaned) return '';
  const $ = cheerio.load(`<div id="sig-root">${cleaned}</div>`, null, false);
  const root = $('#sig-root');

  root.find('figure').each((_, fig) => {
    const $fig = $(fig);
    const $wrap = $('<div></div>').attr('style', SIG_LOGO_WRAP_STYLE);
    $wrap.html($fig.html() || '');
    $fig.replaceWith($wrap);
  });

  root.find('img').each((_, img) => {
    applySignatureImageEmailAttrs($(img));
  });

  root.find('div, p').each((_, el) => {
    const $el = $(el);
    if ($el.is('#sig-root')) return;
    if (isEmptySignatureBlock($, el)) {
      $el.remove();
      return;
    }
    const hasImg = $el.find('img').length > 0;
    $el.removeAttr('class contenteditable').attr(
      'style',
      hasImg ? SIG_LOGO_WRAP_STYLE : SIG_TEXT_BLOCK_STYLE,
    );
  });

  let removed = true;
  while (removed) {
    removed = false;
    root.find('br').each((_, br) => {
      if ($(br).prev('br').length) {
        $(br).remove();
        removed = true;
      }
    });
  }

  return (root.html() || '').trim();
}

export function signatureHtmlForEmail(signature: string): string {
  const trimmed = signature.trim();
  if (!trimmed) return '';
  if (isHtmlSignature(trimmed)) return normalizeSignatureHtmlForEmail(trimmed);
  return signatureToHtml(trimmed);
}

export function signatureToHtml(signature: string): string {
  return signature
    .split('\n')
    .map((line) => escHtml(line.trimEnd()))
    .join('<br />');
}

export function appendSignatureToPlainText(body: string, signature: string): string {
  const sig = signatureToPlainText(signature);
  if (!sig) return body;
  const trimmed = body.trimEnd();
  if (trimmed.endsWith(sig)) return body;
  return `${trimmed}\n\n${sig}`;
}

export function appendSignatureToHtmlFragment(html: string, signature: string): string {
  const sigHtml = signatureHtmlForEmail(signature);
  if (!sigHtml) return html;
  const block =
    `<div style="margin-top:24px;color:#444444;font-size:14px;line-height:1.55;font-family:Arial,Helvetica,sans-serif">${sigHtml}</div>`;
  return `${html}${block}`;
}
