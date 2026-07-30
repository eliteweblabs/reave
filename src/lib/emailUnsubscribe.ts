/**
 * Parse List-Unsubscribe / List-Unsubscribe-Post (RFC 8058) and perform
 * server-side one-click unsubscribe for inbound inbox messages.
 */

import { isPrivateHost } from './publicUrl';

export interface EmailUnsubscribeInfo {
  /** True when an HTTPS List-Unsubscribe URL can be invoked server-side. */
  available: boolean;
  /** True when List-Unsubscribe-Post supports RFC 8058 one-click POST. */
  oneClick?: boolean;
}

function headerValue(headers: Record<string, string>, name: string): string {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return String(v);
  }
  return '';
}

function parseAngleBracketUris(value: string): string[] {
  const uris: string[] = [];
  const re = /<([^>]+)>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    uris.push(match[1].trim());
  }
  return uris;
}

function normalizeUnsubscribeUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (isPrivateHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function parseListUnsubscribeUris(value: string): string[] {
  const bracketed = parseAngleBracketUris(value);
  if (bracketed.length) return bracketed;
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function firstHttpUnsubscribeUrl(headers: Record<string, string>): URL | null {
  const listValue = headerValue(headers, 'List-Unsubscribe');
  if (!listValue) return null;
  for (const uri of parseListUnsubscribeUris(listValue)) {
    const url = normalizeUnsubscribeUrl(uri);
    if (url) return url;
  }
  return null;
}

export function hasListUnsubscribeHeader(headers: Record<string, string> | undefined | null): boolean {
  if (!headers || typeof headers !== 'object') return false;
  return !!headerValue(headers, 'List-Unsubscribe');
}

function supportsOneClickPost(headers: Record<string, string>): boolean {
  const post = headerValue(headers, 'List-Unsubscribe-Post');
  return /one-click/i.test(post);
}

/** Expose unsubscribe when an HTTPS List-Unsubscribe URL exists (not mailto-only). */
export function parseEmailUnsubscribe(
  headers: Record<string, string> | undefined | null,
): EmailUnsubscribeInfo {
  if (!headers || typeof headers !== 'object') return { available: false };
  const url = firstHttpUnsubscribeUrl(headers);
  if (!url) return { available: false };
  return { available: true, oneClick: supportsOneClickPost(headers) };
}

export async function performEmailUnsubscribe(
  headers: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const url = firstHttpUnsubscribeUrl(headers);
  if (!url) {
    return { ok: false, error: 'This message does not include an unsubscribe link.' };
  }

  const oneClick = supportsOneClickPost(headers);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url.toString(), {
      method: oneClick ? 'POST' : 'GET',
      headers: oneClick
        ? {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Reave-Inbox/1.0 (List-Unsubscribe One-Click)',
          }
        : { 'User-Agent': 'Reave-Inbox/1.0 (List-Unsubscribe)' },
      body: oneClick ? 'List-Unsubscribe=One-Click' : undefined,
      signal: controller.signal,
      redirect: 'follow',
    });
    if (res.ok || res.status === 204) return { ok: true };
    return { ok: false, error: `Unsubscribe failed (HTTP ${res.status}).` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    if (msg.includes('abort')) return { ok: false, error: 'Unsubscribe request timed out.' };
    return { ok: false, error: 'Could not reach the unsubscribe endpoint.' };
  } finally {
    clearTimeout(timeout);
  }
}
