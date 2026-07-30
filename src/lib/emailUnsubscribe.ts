/**
 * Parse List-Unsubscribe / List-Unsubscribe-Post (RFC 8058) and perform
 * server-side one-click unsubscribe for inbound inbox messages.
 */

import { isPrivateHost } from './publicUrl';

export interface EmailUnsubscribeInfo {
  /** True when RFC 8058 one-click unsubscribe can be attempted. */
  available: boolean;
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

function firstHttpUnsubscribeUrl(headers: Record<string, string>): URL | null {
  const listValue = headerValue(headers, 'List-Unsubscribe');
  if (!listValue) return null;
  for (const uri of parseAngleBracketUris(listValue)) {
    const url = normalizeUnsubscribeUrl(uri);
    if (url) return url;
  }
  return null;
}

function supportsOneClickPost(headers: Record<string, string>): boolean {
  const post = headerValue(headers, 'List-Unsubscribe-Post');
  return /one-click/i.test(post);
}

/** Only expose unsubscribe when automatic one-click is possible (not mailto / manual pages). */
export function parseEmailUnsubscribe(
  headers: Record<string, string> | undefined | null,
): EmailUnsubscribeInfo {
  if (!headers || typeof headers !== 'object') return { available: false };
  const url = firstHttpUnsubscribeUrl(headers);
  if (!url || !supportsOneClickPost(headers)) return { available: false };
  return { available: true };
}

export async function performEmailUnsubscribe(
  headers: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const info = parseEmailUnsubscribe(headers);
  if (!info.available) {
    return { ok: false, error: 'This message does not support one-click unsubscribe.' };
  }

  const url = firstHttpUnsubscribeUrl(headers);
  if (!url) {
    return { ok: false, error: 'This message does not support one-click unsubscribe.' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Reave-Inbox/1.0 (List-Unsubscribe One-Click)',
      },
      body: 'List-Unsubscribe=One-Click',
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
