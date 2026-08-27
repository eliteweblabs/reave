import type { EmailInboxRecord } from './emailInboxStore';
import { parseSenderEmail } from './emailAddress';
import { escapeHtml } from './htmlEscape';
import { sanitizeEmailHtml } from './sanitizeEmailHtml';
import { normalizeMessageId } from './emailMessageId';

export { messageIdLookupKeys, normalizeMessageId } from './emailMessageId';

const QUOTE_MARKER_RE = /\n\n---\nOn .+ wrote:\n/;
const QUOTE_MARKER_LOOSE_RE = /\n\nOn .+ wrote:\n/;
const MAX_QUOTED_HTML = 200_000;

function headerValue(headers: Record<string, string> | undefined, name: string): string {
  if (!headers) return '';
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return String(v).trim();
  }
  return '';
}

export function buildReplySubject(subject: string): string {
  const s = subject.trim();
  if (/^re:\s/i.test(s)) return s;
  return `Re: ${s || '(no subject)'}`;
}

export function resolveReplyRecipient(
  inbound: Pick<EmailInboxRecord, 'from' | 'replyTo'>,
): string {
  const replyTo = Array.isArray(inbound.replyTo)
    ? inbound.replyTo.find((a) => a.includes('@'))
    : null;
  if (replyTo) return parseSenderEmail(replyTo);
  return parseSenderEmail(inbound.from);
}

export function buildReplyEmailHeaders(
  inbound: Pick<EmailInboxRecord, 'messageId' | 'headers'>,
): Record<string, string> | undefined {
  const msgId = normalizeMessageId(inbound.messageId);
  if (!msgId) return undefined;

  const references = headerValue(inbound.headers, 'references');
  const refChain = references ? `${references} ${msgId}`.trim() : msgId;

  return {
    'In-Reply-To': msgId,
    References: refChain,
  };
}

export function formatQuotedReplyBody(opts: {
  from: string;
  receivedAt: string;
  bodyText: string;
}): string {
  const body = opts.bodyText.trim();
  if (!body) return '';
  const when = new Date(opts.receivedAt).toLocaleString();
  const quoted = body
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return `\n\n---\nOn ${when}, ${opts.from} wrote:\n${quoted}`;
}

/** Split a compose body into the new draft and the appended `---` quote block. */
export function splitQuotedReplyBody(body: string): { draft: string; quote: string } {
  const text = String(body || '');
  const match = text.match(QUOTE_MARKER_RE) || text.match(QUOTE_MARKER_LOOSE_RE);
  if (!match || match.index == null) return { draft: text, quote: '' };
  return { draft: text.slice(0, match.index).trimEnd(), quote: text.slice(match.index) };
}

function extractQuotedHtmlFragment(html: string): string {
  const sanitized = sanitizeEmailHtml(html, { keepStyles: true })
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .trim();
  if (!sanitized) return '';
  const body = sanitized.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const fragment = (body ? body[1] : sanitized)
    .replace(/<\/?(?:html|head|body)[^>]*>/gi, '')
    .replace(/<meta[^>]*>/gi, '')
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
    .trim();
  if (fragment.length > MAX_QUOTED_HTML) {
    return `${fragment.slice(0, MAX_QUOTED_HTML)}\n<!-- truncated -->`;
  }
  return fragment;
}

function plainTextToQuotedHtml(text: string): string {
  return escapeHtml(text)
    .split('\n')
    .map((line) => line.replace(/^&gt; /, ''))
    .join('<br>\n');
}

export function quotedReplyHtmlFromText(quote: string): string {
  const trimmed = quote.replace(/^\n+/, '').replace(/^---\s*/, '').trim();
  if (!trimmed) return '';
  const headerMatch = trimmed.match(/^On .+ wrote:/);
  const header = headerMatch?.[0] ?? '';
  const body = header ? trimmed.slice(header.length).replace(/^\n/, '') : trimmed;
  return formatQuotedReplyHtmlBlock(header, plainTextToQuotedHtml(body));
}

function formatQuotedReplyHtmlBlock(header: string, innerHtml: string): string {
  if (!innerHtml.trim()) return '';
  const headerHtml = header
    ? `<p style="margin:0 0 12px;color:#666666;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5">${escapeHtml(header)}</p>`
    : '';
  return `<div class="email-quote">
  ${headerHtml}
  <blockquote style="margin:0;padding:0 0 0 14px;border-left:3px solid #d4d4d4;color:#444444;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;overflow:auto">
    ${innerHtml}
  </blockquote>
</div>`;
}

/** HTML quotation of the original message — prefers stored HTML over `>` text. */
export function formatQuotedReplyHtml(opts: {
  from: string;
  receivedAt: string;
  bodyHtml?: string;
  bodyText?: string;
}): string {
  const when = new Date(opts.receivedAt).toLocaleString();
  const header = `On ${when}, ${opts.from} wrote:`;
  const html = opts.bodyHtml?.trim() ? extractQuotedHtmlFragment(opts.bodyHtml) : '';
  const inner = html || (opts.bodyText?.trim() ? plainTextToQuotedHtml(opts.bodyText.trim()) : '');
  return formatQuotedReplyHtmlBlock(header, inner);
}
