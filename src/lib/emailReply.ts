import type { EmailInboxRecord } from './emailInboxStore';
import { parseSenderEmail } from './emailAddress';

function headerValue(headers: Record<string, string> | undefined, name: string): string {
  if (!headers) return '';
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return String(v).trim();
  }
  return '';
}

/** RFC 5322 Message-ID values are angle-bracketed. */
export function normalizeMessageId(raw: string): string {
  const id = raw.trim();
  if (!id) return '';
  if (id.startsWith('<') && id.endsWith('>')) return id;
  const inner = id.replace(/^<|>$/g, '');
  return inner ? `<${inner}>` : '';
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
