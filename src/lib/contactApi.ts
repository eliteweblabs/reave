/**
 * eliteweblabs/contact-api — fuzzy contact resolution (Railway: Reave App → contact-api + contact-postgres).
 * @see https://github.com/eliteweblabs/contact-api
 */
import { serverEnv } from './serverEnv';
import { siteBaseUrl } from './requestOrigin';
import { hasFeature } from './features';

export { siteBaseUrl } from './requestOrigin';

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

/** Shareable, iOS-friendly portal URL for a contact uid. */
export function clientPortalUrl(uid: string, opts?: { tab?: string }): string {
  const base = `${siteBaseUrl()}/c/${encodeURIComponent(uid)}`;
  const tab = opts?.tab?.trim();
  if (!tab) return base;
  return `${base}?tab=${encodeURIComponent(tab)}`;
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

/** Compact text from resolve JSON */
export function formatResolveSummary(data: unknown): string {
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

/** Safe trim for contact-api fields (null/undefined/non-string → ''). */
export function contactStringField(value: unknown): string {
  if (value == null) return '';
  return typeof value === 'string' ? value.trim() : String(value).trim();
}

/** Build a tel: href only when there are enough digits to dial. */
export function contactTelHref(phone: unknown): string {
  const stripped = contactStringField(phone).replace(/[^\d+]/g, '');
  if (stripped.replace(/\D/g, '').length < 3) return '';
  return stripped;
}

function nullableContactField(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = contactStringField(value);
  return trimmed || null;
}

/** Normalize contact-api string fields so null/non-string values never reach .trim() or regex. */
export function normalizeContactRecord(contact: ContactRecord): ContactRecord {
  return {
    ...contact,
    name: contactStringField(contact.name) || contact.uid,
    firstName: nullableContactField(contact.firstName),
    lastName: nullableContactField(contact.lastName),
    email: nullableContactField(contact.email),
    phone: nullableContactField(contact.phone),
    company: nullableContactField(contact.company),
    notes: nullableContactField(contact.notes),
  };
}

export type ClientPortalField = { label: string; value: string };

export type ClientPortalGeo = {
  lat: number;
  lng: number;
  placeId?: string;
  /** ISO timestamp when coords were last resolved. */
  geocodedAt?: string;
};

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

export type SiteMonitoringMeta = {
  /** When false, skip ChangeDetection watch even if Site URL is set. Default true. */
  enabled?: boolean;
  watchUuid?: string;
  watchUrl?: string;
  updatedAt?: string;
};

export type ClientPortal = {
  /** When false, the public page returns 404 (revoked) even if content exists. */
  enabled?: boolean;
  headline?: string;
  /** Free text shown to the client; newlines preserved, URLs auto-linked. */
  body?: string;
  /** Client company logo — fetched from their website or set manually. */
  logoUrl?: string;
  /** Public website URL shown under the logo. */
  website?: string;
  /** Short company blurb (often from site meta description). */
  tagline?: string;
  /** Client street / mailing address (shown on admin client page + optional portal). */
  address?: string;
  /** Geocoded coordinates for `address`. */
  geo?: ClientPortalGeo;
  fields?: ClientPortalField[];
  /** Web-design handoff data (passwords, DNS, hosting…) shown in the Data tab. */
  data?: ClientDataEntry[];
  /** Signed documents — appended on each signing event, never overwritten. */
  documents?: PortalDocument[];
  /** ChangeDetection.io watch metadata (when site_monitoring feature is enabled). */
  siteMonitoring?: SiteMonitoringMeta;
  updatedAt?: string;
};

const PORTAL_SYSTEM = 'portal';

/** Summary shape for list views — no notes or full metadata. */
export function contactSummary(c: ContactRecord) {
  return {
    uid: c.uid,
    name: c.name,
    email: contactStringField(c.email),
    phone: contactStringField(c.phone),
    company: contactStringField(c.company),
    archived: !!c.archived,
    updatedAt: c.updatedAt ?? c.createdAt ?? '',
    ...(hasFeature('client_portal') ? { portal_url: clientPortalUrl(c.uid) } : {}),
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
    return { ok: true, data: normalizeContactRecord(contact) };
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
    return { ok: true, data: normalizeContactRecord(contact) };
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
  if (patch.name !== undefined) body.name = contactStringField(patch.name);
  if (patch.email !== undefined) body.email = contactStringField(patch.email);
  if (patch.phone !== undefined) body.phone = contactStringField(patch.phone);
  if (patch.company !== undefined) body.company = contactStringField(patch.company);
  if (patch.notes !== undefined) body.notes = contactStringField(patch.notes);
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
    return { ok: true, data: normalizeContactRecord(contact) };
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

/** Delete a contact by uid (DELETE /api/contacts/:uid). Soft-archives by default; ?permanent=true hard-deletes. */
export async function deleteContact(
  uid: string,
  opts?: { permanent?: boolean },
): Promise<{ ok: true; already_archived?: boolean } | { ok: false; error: string; status?: number }> {
  const base = baseUrl();
  if (!base) return { ok: false, error: 'CONTACT_API_BASE_URL is not set' };
  if (!uid?.trim()) return { ok: false, error: 'uid is required' };

  const trimmed = uid.trim();
  const qs = opts?.permanent ? '?permanent=true' : '';

  try {
    const res = await fetch(`${base}/api/contacts/${encodeURIComponent(trimmed)}${qs}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const text = await res.text().catch(() => '');
    let json: { error?: string; message?: string; already_archived?: boolean } = {};
    try {
      json = text ? (JSON.parse(text) as typeof json) : {};
    } catch {
      json = {};
    }
    if (res.ok) {
      return { ok: true, already_archived: json?.already_archived };
    }
    const msg = json?.error ?? json?.message ?? text.slice(0, 200) ?? res.statusText;
    if (!opts?.permanent && res.status === 404 && /already archived/i.test(msg)) {
      return { ok: true, already_archived: true };
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
  const raw = link.metadata as ClientPortal;
  return {
    ...raw,
    headline: contactStringField(raw.headline) || undefined,
    body: contactStringField(raw.body) || undefined,
    logoUrl: contactStringField(raw.logoUrl) || undefined,
    website: contactStringField(raw.website) || undefined,
    tagline: contactStringField(raw.tagline) || undefined,
    address: contactStringField(raw.address) || undefined,
    geo:
      raw.geo &&
      typeof raw.geo === 'object' &&
      Number.isFinite(Number((raw.geo as ClientPortalGeo).lat)) &&
      Number.isFinite(Number((raw.geo as ClientPortalGeo).lng))
        ? {
            lat: Number((raw.geo as ClientPortalGeo).lat),
            lng: Number((raw.geo as ClientPortalGeo).lng),
            placeId: contactStringField((raw.geo as ClientPortalGeo).placeId) || undefined,
            geocodedAt: contactStringField((raw.geo as ClientPortalGeo).geocodedAt) || undefined,
          }
        : undefined,
    updatedAt: contactStringField(raw.updatedAt) || undefined,
    fields: Array.isArray(raw.fields)
      ? raw.fields
          .filter((f) => f && contactStringField(f.label) && contactStringField(f.value))
          .map((f) => ({
            label: contactStringField(f.label),
            value: contactStringField(f.value),
          }))
      : raw.fields,
    data: Array.isArray(raw.data)
      ? raw.data
          .filter((e) => e && contactStringField(e.label))
          .map((e) => ({
            ...e,
            label: contactStringField(e.label),
            value: contactStringField(e.value) || undefined,
            username: contactStringField(e.username) || undefined,
            password: contactStringField(e.password) || undefined,
            url: contactStringField(e.url) || undefined,
          }))
      : raw.data,
  };
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

  const trimmedUid = uid.trim();
  let metadata: ClientPortal = { ...portal, updatedAt: new Date().toISOString() };

  // Site monitoring sync (optional module) — merge watch metadata before save.
  try {
    const { hasFeature } = await import('./features');
    const { syncSiteWatchForPortal } = await import('./siteMonitoring');
    if (hasFeature('site_monitoring')) {
      let previousPortal: ClientPortal | null = null;
      let contactName = trimmedUid;
      const current = await getContact(trimmedUid);
      if (current.ok) {
        previousPortal = extractPortal(current.data);
        contactName = contactStringField(current.data.name) || contactName;
      }
      metadata = await syncSiteWatchForPortal({
        uid: trimmedUid,
        contactName,
        portal: metadata,
        previousPortal,
      });
      metadata.updatedAt = new Date().toISOString();
    }
  } catch (e) {
    console.warn('[contact-api] site monitoring sync failed', e);
  }

  try {
    const res = await fetch(`${base}/api/contacts/${encodeURIComponent(trimmedUid)}/link`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ system: PORTAL_SYSTEM, externalId: trimmedUid, metadata }),
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
