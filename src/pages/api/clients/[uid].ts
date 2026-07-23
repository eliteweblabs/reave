import type { APIRoute } from 'astro';
import {
  contactStringField,
  contactSummary,
  contactIsPersonal,
  extractPortal,
  getContact,
  isContactApiConfigured,
  setContactPersonal,
  setContactPortal,
  updateContact,
  type ClientDataEntry,
  type ContactRecord,
} from '../../../lib/contactApi';
import { portalSiteUrl } from '../../../lib/siteMonitoring';
import {
  enrichClientPortalBrand,
  setClientPortalWebsite,
  websiteFromNotes,
  setClientPortalAddress,
  parseClientGeoInput,
} from '../../../lib/clientBrand';
import {
  resolveClientIconUrl,
  resolveClientLogoUrl,
} from '../../../lib/clientBranding';
import { getContactDeleteBlockers, executeContactDelete, blockersToJson } from '../../../lib/contactDeleteGuard';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function parseClientPortalData(raw: unknown): ClientDataEntry[] | null {
  if (!Array.isArray(raw)) return null;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return raw
    .filter((e) => e && typeof e === 'object')
    .map((e) => {
      const row = e as Record<string, unknown>;
      const entry: ClientDataEntry = { label: str(row.label) };
      const value = str(row.value);
      const username = str(row.username);
      const password = str(row.password);
      const url = str(row.url);
      if (value) entry.value = value;
      if (username) entry.username = username;
      if (password) entry.password = password;
      if (url) entry.url = url;
      return entry;
    })
    .filter((e) => e.label && (e.value || e.username || e.password || e.url));
}

async function saveClientPortalData(
  uid: string,
  raw: unknown,
  contactData: ContactRecord,
): Promise<{ ok: true; data: ClientDataEntry[] } | { ok: false; error: string }> {
  const parsed = parseClientPortalData(raw);
  if (parsed === null) return { ok: false, error: 'Invalid vault data' };
  const portal = extractPortal(contactData) ?? {};
  const saved = await setContactPortal(uid, {
    ...portal,
    data: parsed,
    updatedAt: new Date().toISOString(),
  });
  if (!saved.ok) return { ok: false, error: saved.error };
  return { ok: true, data: parsed };
}

function hasContactFieldPatch(body: Record<string, unknown>): boolean {
  return (
    typeof body.name === 'string' ||
    typeof body.email === 'string' ||
    body.email === null ||
    typeof body.phone === 'string' ||
    body.phone === null ||
    typeof body.company === 'string' ||
    body.company === null ||
    typeof body.notes === 'string' ||
    body.notes === null
  );
}

async function loadContactForClientPatch(
  uid: string,
  body: Record<string, unknown>,
): Promise<
  | { ok: true; data: ContactRecord }
  | { ok: false; error: string; status?: number }
> {
  if (!hasContactFieldPatch(body)) {
    const current = await getContact(uid);
    if (!current.ok) return { ok: false, error: current.error, status: current.status ?? 404 };
    return { ok: true, data: current.data };
  }

  const res = await updateContact(uid, {
    name: typeof body.name === 'string' ? body.name : undefined,
    email: typeof body.email === 'string' ? body.email : body.email == null ? '' : undefined,
    phone: typeof body.phone === 'string' ? body.phone : body.phone == null ? '' : undefined,
    company: typeof body.company === 'string' ? body.company : body.company == null ? '' : undefined,
    notes: typeof body.notes === 'string' ? body.notes : body.notes == null ? '' : undefined,
  });
  if (!res.ok) return { ok: false, error: res.error, status: res.status ?? 502 };
  return { ok: true, data: res.data };
}

async function saveClientPortalFields(
  uid: string,
  body: Record<string, unknown>,
  contactData: ContactRecord,
) {
  if (typeof body.personal === 'boolean') {
    const saved = await setContactPersonal(uid, body.personal);
    if (!saved.ok) return { ok: false as const, error: saved.error };
  }

  let website = '';
  if (typeof body.website === 'string') {
    const saved = await setClientPortalWebsite(uid, body.website);
    if (!saved.ok) return { ok: false as const, error: saved.error };
    website = saved.website;
  } else {
    const portal = extractPortal(contactData);
    website = portal?.website?.trim() || portalSiteUrl(portal) || '';
  }

  let address = '';
  let geo: ReturnType<typeof parseClientGeoInput> | null = null;
  if (typeof body.address === 'string') {
    const geoInput =
      body.geo === null ? null : body.geo != null ? parseClientGeoInput(body.geo) : undefined;
    const saved = await setClientPortalAddress(uid, body.address, geoInput);
    if (!saved.ok) return { ok: false as const, error: saved.error };
    address = saved.address;
    geo = saved.geo ?? null;
  } else {
    const portal = extractPortal(contactData);
    address = contactStringField(portal?.address) || '';
    geo = portal?.geo ?? null;
  }

  return { ok: true as const, website, address, geo };
}

async function clientPortalBranding(uid: string) {
  const res = await getContact(uid);
  if (!res.ok) return { logoUrl: '', iconUrl: '' };
  const portal = extractPortal(res.data);
  return {
    logoUrl: resolveClientLogoUrl(portal, uid),
    iconUrl: resolveClientIconUrl(portal, uid),
    logoSource: portal?.logoSource,
    iconSource: portal?.iconSource,
  };
}

export const GET: APIRoute = async ({ params, locals, url }) => {
  const { userId } = locals.auth?.() ?? {};
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const uid = (params.uid ?? '').trim();
  if (!uid) return json({ ok: false, error: 'Not found' }, 404);

  if (url.searchParams.get('preview') === 'delete') {
    const blockers = await getContactDeleteBlockers(uid);
    if (!blockers.ok) return json({ ok: false, error: blockers.error }, 404);
    return json({ ok: true, ...blockersToJson(blockers.data) });
  }

  const res = await getContact(uid);
  if (!res.ok) return json({ ok: false, error: res.error }, res.status ?? 404);

  let contact = res.data;
  let portal = extractPortal(contact);
  let logoUrl = resolveClientLogoUrl(portal, uid);
  let iconUrl = resolveClientIconUrl(portal, uid);

  // Match client portal: best-effort logo fetch from website on first open.
  if (!logoUrl && portal?.logoSource !== 'upload') {
    await enrichClientPortalBrand(uid);
    const refreshed = await getContact(uid);
    if (refreshed.ok) {
      contact = refreshed.data;
      portal = extractPortal(contact);
      logoUrl = resolveClientLogoUrl(portal, uid);
      iconUrl = resolveClientIconUrl(portal, uid);
    }
  }

  const website =
    portal?.website?.trim() ||
    portalSiteUrl(portal) ||
    websiteFromNotes(contact.notes ?? '') ||
    '';

  return json({
    ok: true,
    ...contactSummary(contact),
    firstName: contactStringField(contact.firstName),
    lastName: contactStringField(contact.lastName),
    notes: contact.notes ?? '',
    personal: contactIsPersonal(contact),
    website,
    address: contactStringField(portal?.address) || '',
    geo: portal?.geo ?? null,
    logoUrl,
    iconUrl,
    logoSource: portal?.logoSource,
    iconSource: portal?.iconSource,
    archived: !!contact.archived,
    createdAt: contact.createdAt ?? null,
    data: portal?.data ?? [],
  });
};

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const { userId } = locals.auth?.() ?? {};
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const uid = (params.uid ?? '').trim();
  if (!uid) return json({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const contactRes = await loadContactForClientPatch(uid, body);
  if (!contactRes.ok) return json({ ok: false, error: contactRes.error }, contactRes.status ?? 502);
  const contact = contactRes.data;

  const portalSaved = await saveClientPortalFields(uid, body, contact);
  if (!portalSaved.ok) return json({ ok: false, error: portalSaved.error }, 502);

  let vaultData: ClientDataEntry[] | undefined;
  if (body.data !== undefined) {
    const vaultSaved = await saveClientPortalData(uid, body.data, contact);
    if (!vaultSaved.ok) return json({ ok: false, error: vaultSaved.error }, 400);
    vaultData = vaultSaved.data;
  }

  const branding = await clientPortalBranding(uid);
  const refreshed = await getContact(uid);
  const portal = refreshed.ok ? extractPortal(refreshed.data) : null;

  return json({
    ok: true,
    ...contactSummary(contact),
    firstName: contactStringField(contact.firstName),
    lastName: contactStringField(contact.lastName),
    notes: contact.notes ?? '',
    personal:
      typeof body.personal === 'boolean' ? body.personal : contactIsPersonal(contact),
    website: portalSaved.website,
    address: portalSaved.address,
    geo: portalSaved.geo,
    logoUrl: branding.logoUrl,
    iconUrl: branding.iconUrl,
    logoSource: branding.logoSource,
    iconSource: branding.iconSource,
    archived: !!contact.archived,
    createdAt: contact.createdAt ?? null,
    data: vaultData ?? portal?.data ?? [],
  });
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const { userId } = locals.auth?.() ?? {};
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const uid = (params.uid ?? '').trim();
  if (!uid) return json({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const contactRes = await loadContactForClientPatch(uid, body);
  if (!contactRes.ok) return json({ ok: false, error: contactRes.error }, contactRes.status ?? 502);
  const contact = contactRes.data;

  const portalSaved = await saveClientPortalFields(uid, body, contact);
  if (!portalSaved.ok) return json({ ok: false, error: portalSaved.error }, 502);

  let vaultData: ClientDataEntry[] | undefined;
  if (body.data !== undefined) {
    const vaultSaved = await saveClientPortalData(uid, body.data, contact);
    if (!vaultSaved.ok) return json({ ok: false, error: vaultSaved.error }, 400);
    vaultData = vaultSaved.data;
  }

  const branding = await clientPortalBranding(uid);
  const refreshed = await getContact(uid);
  const portal = refreshed.ok ? extractPortal(refreshed.data) : null;

  return json({
    ok: true,
    ...contactSummary(contact),
    firstName: contactStringField(contact.firstName),
    lastName: contactStringField(contact.lastName),
    notes: contact.notes ?? '',
    personal:
      typeof body.personal === 'boolean' ? body.personal : contactIsPersonal(contact),
    website: portalSaved.website,
    address: portalSaved.address,
    geo: portalSaved.geo,
    logoUrl: branding.logoUrl,
    iconUrl: branding.iconUrl,
    logoSource: branding.logoSource,
    iconSource: branding.iconSource,
    archived: !!contact.archived,
    createdAt: contact.createdAt ?? null,
    data: vaultData ?? portal?.data ?? [],
  });
};

export const DELETE: APIRoute = async ({ params, locals, url }) => {
  const { userId } = locals.auth?.() ?? {};
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const uid = (params.uid ?? '').trim();
  if (!uid) return json({ ok: false, error: 'Not found' }, 404);

  const force = url.searchParams.get('force') === 'true';
  const result = await executeContactDelete(uid, { force, permanent: force });
  if (!result.ok) {
    const body: Record<string, unknown> = { ok: false, error: result.error };
    if (result.blockers) Object.assign(body, blockersToJson(result.blockers));
    return json(body, result.status ?? 502);
  }
  return json({
    ok: true,
    contact_name: result.contact_name,
    deleted_projects: result.deleted_projects,
    already_archived: result.already_archived ?? false,
    permanent: result.permanent ?? false,
  });
};
