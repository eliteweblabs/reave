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

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = serverEnv('CONTACT_API_KEY')?.trim();
  if (key) headers['X-API-Key'] = key;
  return headers;
}

export function isContactApiConfigured(): boolean {
  return Boolean(baseUrl());
}

/**
 * Public origin used to build shareable client-portal links. Prefer an explicit
 * PUBLIC_SITE_URL; otherwise fall back to Railway's injected domain, then reave.app.
 */
export function siteBaseUrl(): string {
  const explicit = serverEnv('PUBLIC_SITE_URL')?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const railway = serverEnv('RAILWAY_PUBLIC_DOMAIN')?.trim();
  if (railway) return `https://${railway.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  return 'https://reave.app';
}

/** Shareable, iOS-friendly portal URL for a contact uid. */
export function clientPortalUrl(uid: string): string {
  return `${siteBaseUrl()}/c/${encodeURIComponent(uid)}`;
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

  try {
    const res = await fetch(`${base}/api/contacts/resolve`, {
      method: 'POST',
      headers: authHeaders(),
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

// ---------------------------------------------------------------------------
// Client portal — a shareable, iOS-friendly page per contact.
//
// Storage trick: we DO NOT need to modify the contact-api schema. Client-facing
// content is stored as a `contact_links` row with system='portal' (JSONB
// metadata), which the existing POST /api/contacts/:uid/link upserts and
// GET /api/contacts/:uid returns. This keeps the portal cleanly separate from
// the private internal `notes` field (so internal notes never leak to clients).
// ---------------------------------------------------------------------------

export type ContactLink = { system: string; externalId: string; metadata?: Record<string, unknown> | null };

export type ContactRecord = {
  uid: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
  archived?: boolean;
  links?: ContactLink[];
};

export type ClientPortalField = { label: string; value: string };

export type ClientPortal = {
  /** When false, the public page returns 404 (revoked) even if content exists. */
  enabled?: boolean;
  headline?: string;
  /** Free text shown to the client; newlines preserved, URLs auto-linked. */
  body?: string;
  fields?: ClientPortalField[];
  updatedAt?: string;
};

const PORTAL_SYSTEM = 'portal';

/** Fetch a single contact (with aliases + links) by uid. */
export async function getContact(
  uid: string
): Promise<{ ok: true; data: ContactRecord } | { ok: false; error: string; status?: number }> {
  const base = baseUrl();
  if (!base) return { ok: false, error: 'CONTACT_API_BASE_URL is not set' };
  if (!uid?.trim()) return { ok: false, error: 'uid is required' };

  try {
    const res = await fetch(`${base}/api/contacts/${encodeURIComponent(uid.trim())}`, {
      method: 'GET',
      headers: authHeaders(),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const err =
        json && typeof json === 'object' && 'error' in json
          ? String((json as { error: unknown }).error)
          : text.slice(0, 200) || res.statusText;
      return { ok: false, error: err, status: res.status };
    }
    const contact =
      json && typeof json === 'object' && 'contact' in json
        ? ((json as { contact: ContactRecord }).contact)
        : (json as ContactRecord);
    if (!contact || typeof contact !== 'object' || !contact.uid) {
      return { ok: false, error: 'Unexpected contact-api response' };
    }
    return { ok: true, data: contact };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** List/search contacts (GET /api/contacts). Optional fuzzy text `q`. */
export async function listContacts(opts: {
  q?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<
  | { ok: true; data: { total: number; contacts: ContactRecord[] } }
  | { ok: false; error: string; status?: number }
> {
  const base = baseUrl();
  if (!base) return { ok: false, error: 'CONTACT_API_BASE_URL is not set' };

  const params = new URLSearchParams();
  if (opts.q?.trim()) params.set('q', opts.q.trim());
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  params.set('limit', String(limit));
  if (opts.offset && opts.offset > 0) params.set('offset', String(opts.offset));

  try {
    const res = await fetch(`${base}/api/contacts?${params.toString()}`, {
      method: 'GET',
      headers: authHeaders(),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const err =
        json && typeof json === 'object' && 'error' in json
          ? String((json as { error: unknown }).error)
          : text.slice(0, 200) || res.statusText;
      return { ok: false, error: err, status: res.status };
    }
    const o = (json ?? {}) as { total?: number; contacts?: ContactRecord[] };
    return { ok: true, data: { total: Number(o.total ?? 0), contacts: o.contacts ?? [] } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Pull the portal payload out of a contact's links, if present. */
export function extractPortal(contact: ContactRecord): ClientPortal | null {
  const link = (contact.links ?? []).find((l) => l.system === PORTAL_SYSTEM);
  if (!link || !link.metadata || typeof link.metadata !== 'object') return null;
  return link.metadata as ClientPortal;
}

/**
 * Create/replace the portal payload for a contact (upsert on system='portal').
 * NOTE: contact-api replaces metadata wholesale, so callers should pass the full
 * desired portal object (merge with existing first if doing partial updates).
 */
export async function setContactPortal(
  uid: string,
  portal: ClientPortal
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const base = baseUrl();
  if (!base) return { ok: false, error: 'CONTACT_API_BASE_URL is not set' };
  if (!uid?.trim()) return { ok: false, error: 'uid is required' };

  const metadata: ClientPortal = { ...portal, updatedAt: new Date().toISOString() };

  try {
    const res = await fetch(`${base}/api/contacts/${encodeURIComponent(uid.trim())}/link`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ system: PORTAL_SYSTEM, externalId: uid.trim(), metadata }),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, error: text.slice(0, 200) || res.statusText };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
