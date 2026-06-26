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
  createdAt?: string | null;
  updatedAt?: string | null;
  links?: ContactLink[];
};

export type ClientPortalField = { label: string; value: string };

/**
 * A handoff "Data" entry shared with a web-design client: a credential, a DNS
 * record, hosting info, etc. `password` is masked on the page (reveal/copy).
 */
export type ClientDataEntry = {
  label: string;
  value?: string;
  username?: string;
  password?: string;
  url?: string;
};

/** A signed/approved document stored in the client's portal. */
export type PortalDocument = {
  /** Unique UUID per signing event. */
  id: string;
  /** Template slug (e.g. "contract", "nda"). */
  template: string;
  /** Human-readable title. */
  title: string;
  /** ISO timestamp of signing. */
  signedAt: string;
  /** Full name typed by signer. */
  signerName: string;
  /**
   * Complete signed artifact: filled template HTML + inline-styled signature block
   * + audit table, all baked in at signing time. Self-contained for print/PDF.
   */
  content: string;

  // ── Compliance / audit fields (added for ESIGN / UETA validity) ────────────
  /** Signer's IP address at signing time (from x-forwarded-for / x-real-ip). */
  ip?: string;
  /** Raw User-Agent string at signing time. */
  userAgent?: string;
  /** ISO timestamp when the "I agree to sign electronically" checkbox was confirmed. */
  consentAt?: string;
  /** SHA-256 hex digest of the filled HTML presented to the signer (pre-signature-block). */
  contentHash?: string;
};

export type ClientPortal = {
  /** When false, the public page returns 404 (revoked) even if content exists. */
  enabled?: boolean;
  headline?: string;
  /** Free text shown to the client; newlines preserved, URLs auto-linked. */
  body?: string;
  fields?: ClientPortalField[];
  /** Web-design handoff data (passwords, DNS, hosting…) shown in the Data tab. */
  data?: ClientDataEntry[];
  /** Signed documents — appended on each signing event, never overwritten. */
  documents?: PortalDocument[];
  updatedAt?: string;
};

const PORTAL_SYSTEM = 'portal';

/** Summary shape for list views — no notes or full metadata. */
export function contactSummary(c: ContactRecord) {
  return {
    uid: c.uid,
    name: c.name,
    email: c.email ?? '',
    phone: c.phone ?? '',
    company: c.company ?? '',
    archived: !!c.archived,
    updatedAt: c.updatedAt ?? c.createdAt ?? '',
    portal_url: clientPortalUrl(c.uid),
  };
}

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

/** Create a new contact (POST /api/contacts). Returns the created record. */
export async function createContact(input: {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
}): Promise<{ ok: true; data: ContactRecord } | { ok: false; error: string; status?: number }> {
  const base = baseUrl();
  if (!base) return { ok: false, error: 'CONTACT_API_BASE_URL is not set' };
  if (!input.name?.trim()) return { ok: false, error: 'name is required' };

  try {
    const res = await fetch(`${base}/api/contacts`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        name: input.name.trim(),
        email: input.email?.trim() || undefined,
        phone: input.phone?.trim() || undefined,
        company: input.company?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
      }),
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

/**
 * Update a contact's core "Meta" fields (PATCH /api/contacts/:uid).
 *
 * Only the keys you pass are changed; omitted keys keep their current value.
 * NOTE: contact-api has no separate first/last write fields — it derives them
 * from `name` via splitName(). To change first or last name, pass the full
 * reconstructed `name`. Old values are auto-saved as aliases upstream.
 */
export async function updateContact(
  uid: string,
  patch: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    notes?: string;
  }
): Promise<{ ok: true; data: ContactRecord } | { ok: false; error: string; status?: number }> {
  const base = baseUrl();
  if (!base) return { ok: false, error: 'CONTACT_API_BASE_URL is not set' };
  if (!uid?.trim()) return { ok: false, error: 'uid is required' };

  const body: Record<string, string> = {};
  if (patch.name !== undefined) body.name = patch.name.trim();
  if (patch.email !== undefined) body.email = patch.email.trim();
  if (patch.phone !== undefined) body.phone = patch.phone.trim();
  if (patch.company !== undefined) body.company = patch.company.trim();
  if (patch.notes !== undefined) body.notes = patch.notes.trim();
  if (!Object.keys(body).length) return { ok: false, error: 'nothing to update' };

  try {
    const res = await fetch(`${base}/api/contacts/${encodeURIComponent(uid.trim())}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(body),
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

/** Delete a contact by uid (DELETE /api/contacts/:uid). */
export async function deleteContact(
  uid: string
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const base = baseUrl();
  if (!base) return { ok: false, error: 'CONTACT_API_BASE_URL is not set' };
  if (!uid?.trim()) return { ok: false, error: 'uid is required' };

  try {
    const res = await fetch(`${base}/api/contacts/${encodeURIComponent(uid.trim())}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (res.ok) return { ok: true };
    const text = await res.text().catch(() => '');
    let msg: string;
    try {
      const j = text ? (JSON.parse(text) as { error?: string; message?: string }) : {};
      msg = j.error ?? j.message ?? text.slice(0, 200) ?? res.statusText;
    } catch {
      msg = text.slice(0, 200) || res.statusText;
    }
    return { ok: false, error: msg, status: res.status };
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
