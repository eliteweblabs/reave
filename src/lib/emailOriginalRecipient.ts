/**
 * Display To for forwarded inbound mail.
 *
 * Resend's envelope recipient is the catch-all (`thomas@inbound.reave.app`).
 * When several mailboxes BCC/forward into that address, the owner needs the
 * original mailbox — Gmail puts it in X-Forwarded-For, others in X-Original-To
 * or the message To header.
 */

import { parseSenderEmail } from './emailAddress';

const EMAIL_RE = /[^\s<>"',;]+@[^\s<>"',;]+/g;

const ORIGINAL_HEADER_NAMES = [
  'x-forwarded-for',
  'x-original-to',
  'x-gm-original-to',
  'original-recipient',
  'x-envelope-original-to',
];

export function headerValue(
  headers: Record<string, unknown> | null | undefined,
  name: string,
): string {
  if (!headers || typeof headers !== 'object') return '';
  const want = name.toLowerCase();
  for (const [key, raw] of Object.entries(headers)) {
    if (key.toLowerCase() !== want) continue;
    if (Array.isArray(raw)) return raw.map((v) => String(v ?? '').trim()).filter(Boolean).join(', ');
    return String(raw ?? '').trim();
  }
  return '';
}

export function hasOriginalRecipientHeaders(
  headers: Record<string, unknown> | null | undefined,
): boolean {
  return ORIGINAL_HEADER_NAMES.some((name) => extractEmails(headerValue(headers, name)).length > 0);
}

/** inbound.* receiving hosts (Resend MX), including inbound.reave.app. */
export function isInboundReceivingHost(host: string): boolean {
  const h = String(host || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  return h === 'inbound.reave.app' || h.startsWith('inbound.');
}

/**
 * Generic catch-all on the inbound MX (`inbox@`, `thomas@inbound…`).
 * Plus-addressed locals (`thomas+gmail@inbound…`) are kept — those are useful aliases.
 */
export function isGenericInboundMailbox(address: string): boolean {
  const email = parseSenderEmail(address);
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const local = email.slice(0, at);
  const host = email.slice(at + 1);
  if (!isInboundReceivingHost(host)) return false;
  if (local.includes('+')) return false;
  return true;
}

function looksLikeIp(token: string): boolean {
  const t = token.trim();
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(t)) return true;
  if (/^[0-9a-f:]+$/i.test(t) && t.includes(':')) return true;
  return false;
}

function extractEmails(raw: string): string[] {
  if (!raw.trim()) return [];
  const cleaned = raw.replace(/^rfc822\s*;\s*/i, '');
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of cleaned.match(EMAIL_RE) ?? []) {
    const email = parseSenderEmail(match.replace(/[<>]/g, ''));
    if (!email.includes('@') || looksLikeIp(email) || seen.has(email)) continue;
    const host = email.slice(email.lastIndexOf('@') + 1);
    if (looksLikeIp(host)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

function uniqueEmails(addrs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of addrs) {
    const email = parseSenderEmail(raw);
    if (!email.includes('@') || seen.has(email)) continue;
    seen.add(email);
    out.push(raw.trim() || email);
  }
  return out;
}

/**
 * Mailbox the owner actually received this on, before the inbound catch-all.
 * Falls back to the envelope To when no original is present.
 */
export function displayInboxRecipients(
  envelopeTo: string[] | undefined,
  headers?: Record<string, unknown> | null,
): string[] {
  const originals: string[] = [];
  for (const name of ORIGINAL_HEADER_NAMES) {
    originals.push(...extractEmails(headerValue(headers, name)));
  }

  const headerTo = extractEmails(headerValue(headers, 'to'));
  originals.push(...headerTo);

  const useful = uniqueEmails(originals.filter((addr) => !isGenericInboundMailbox(addr)));
  if (useful.length) return useful;

  const envelope = uniqueEmails((envelopeTo ?? []).map(String).filter(Boolean));
  const nonCatchAll = envelope.filter((addr) => !isGenericInboundMailbox(addr));
  if (nonCatchAll.length) return nonCatchAll;
  return envelope;
}
