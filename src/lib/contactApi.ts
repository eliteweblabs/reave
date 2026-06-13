/**
 * eliteweblabs/contact-api — fuzzy contact resolution (Railway: Reave App → contact-api + contact-postgres).
 * @see https://github.com/eliteweblabs/contact-api
 */
import { serverEnv } from './serverEnv';

function baseUrl(): string | null {
  const raw = serverEnv('CONTACT_API_BASE_URL')?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

export function isContactApiConfigured(): boolean {
  return Boolean(baseUrl());
}

export type ResolveContactInput = {
  name?: string;
  email?: string;
  phone?: string;
};

export async function resolveContact(
  input: ResolveContactInput
): Promise<{ ok: true; data: unknown } | { ok: false; error: string; status?: number }> {
  const base = baseUrl();
  if (!base) {
    return { ok: false, error: 'CONTACT_API_BASE_URL is not set' };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const key = serverEnv('CONTACT_API_KEY')?.trim();
  if (key) headers['X-API-Key'] = key;

  try {
    const res = await fetch(`${base}/api/contacts/resolve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: input.name?.trim() || undefined,
        email: input.email?.trim() || undefined,
        phone: input.phone?.trim() || undefined,
      }),
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 500) };
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: typeof data === 'object' && data && 'error' in data
          ? String((data as { error: unknown }).error)
          : text.slice(0, 300) || res.statusText,
      };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Compact text for Telegram from resolve JSON */
export function formatResolveForTelegram(data: unknown): string {
  if (!data || typeof data !== 'object') return JSON.stringify(data, null, 2).slice(0, 3500);

  const o = data as Record<string, unknown>;
  const match = o.match;
  const lines: string[] = [`match: ${String(match ?? '?')}`];

  if (typeof o.score === 'number') lines.push(`score: ${o.score}`);

  const contact = o.contact;
  if (contact && typeof contact === 'object') {
    const c = contact as Record<string, unknown>;
    if (c.uid != null) lines.push(`uid: ${String(c.uid)}`);
    if (c.name != null) lines.push(`name: ${String(c.name)}`);
    if (c.email != null) lines.push(`email: ${String(c.email)}`);
    if (c.phone != null) lines.push(`phone: ${String(c.phone)}`);
  }

  const candidates = o.candidates;
  if (Array.isArray(candidates) && candidates.length) {
    lines.push('candidates:');
    for (const raw of candidates.slice(0, 8)) {
      if (raw && typeof raw === 'object') {
        const c = raw as Record<string, unknown>;
        const bit = [c.name, c.uid, c.score != null ? `score=${c.score}` : null].filter(Boolean).join(' — ');
        lines.push(`  • ${bit || JSON.stringify(c).slice(0, 120)}`);
      } else lines.push(`  • ${String(raw)}`);
    }
    if (candidates.length > 8) lines.push(`  … +${candidates.length - 8} more`);
  }

  const extra = JSON.stringify(o, null, 2);
  if (extra.length < 2800) return lines.join('\n') + '\n\n' + extra;
  return lines.join('\n');
}
