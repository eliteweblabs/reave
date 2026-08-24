import type { APIRoute } from 'astro';
import {
  contactStringField,
  contactSummary,
  contactIsPersonal,
  extractPortal,
  getClientKind,
  getContact,
  isContactApiConfigured,
  parseClientKindInput,
  setContactKind,
  setContactPortal,
  updateContact,
  type ClientDataEntry,
  type ClientPortal,
  type ClientPortalField,
  type ContactRecord,
} from '../../../lib/contactApi';
import { hoursFieldText } from '../../../lib/contactHoursFromPlaces';
import { formatWeekHours, hasAnyHours, parseHoursText } from '../../../lib/businessHours';
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
import { syncContactToCrater } from '../../../lib/contactCraterSync';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

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
      const id = str(row.id);
      const value = str(row.value);
      const username = str(row.username);
      const password = str(row.password);
      const url = str(row.url);
      if (id) entry.id = id;
      if (value) entry.value = value;
      if (username) entry.username = username;
      if (password) entry.password = password;
      if (url) entry.url = url;
      return entry;
    })
    .filter((e) => e.label);
}

function parseVaultKnownIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = raw.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);
  return ids;
}

async function saveClientPortalData(
  uid: string,
  raw: unknown,
  contactData: ContactRecord,
  knownIds?: string[],
): Promise<{ ok: true; data: ClientDataEntry[] } | { ok: false; error: string }> {
  const parsed = parseClientPortalData(raw);
  if (parsed === null) return { ok: false, error: 'Invalid vault data' };
  const portal = extractPortal(contactData) ?? {};
  const saved = await setContactPortal(
    uid,
    {
      ...portal,
      data: parsed,
      updatedAt: new Date().toISOString(),
    },
    { vaultKnownIds: knownIds },
  );
  if (!saved.ok) return { ok: false, error: saved.error };
  const refreshed = await getContact(uid);
  const data = refreshed.ok ? extractPortal(refreshed.data)?.data ?? parsed : parsed;
  return { ok: true, data };
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
  | { ok: true; data: ContactRecord; before?: ContactRecord; craterSync?: unknown }
  | { ok: false; error: string; status?: number }
> {
  if (!hasContactFieldPatch(body)) {
    const current = await getContact(uid);
    if (!current.ok) return { ok: false, error: current.error, status: current.status ?? 404 };
    return { ok: true, data: current.data };
  }

  const previous = await getContact(uid);
  if (!previous.ok) return { ok: false, error: previous.error, status: previous.status ?? 404 };

  const res = await updateContact(uid, {
    name: typeof body.name === 'string' ? body.name : undefined,
    email: typeof body.email === 'string' ? body.email : body.email == null ? '' : undefined,
    phone: typeof body.phone === 'string' ? body.phone : body.phone == null ? '' : undefined,
    company: typeof body.company === 'string' ? body.company : body.company == null ? '' : undefined,
    notes: typeof body.notes === 'string' ? body.notes : body.notes == null ? '' : undefined,
  });
  if (!res.ok) return { ok: false, error: res.error, status: res.status ?? 502 };

  const craterSync = await syncContactToCrater(previous.data, res.data);

  return { ok: true, data: res.data, before: previous.data, craterSync };
}

function portalFieldsWithoutHours(fields: ClientPortalField[] | undefined): ClientPortalField[] {
  return (fields ?? []).filter((f) => !/^hours\b/i.test(f.label || ''));
}

function parsePortalOverviewFields(raw: unknown): ClientPortalField[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const rec = row as Record<string, unknown>;
      return {
        label: typeof rec.label === 'string' ? rec.label.trim() : '',
        value: typeof rec.value === 'string' ? rec.value.trim() : '',
      };
    })
    .filter((row) => row.label || row.value);
}

function clientPortalEditorFields(portal: ClientPortal | null | undefined) {
  const hoursText =
    hoursFieldText(portal) ||
    (portal?.hours?.displayLines ?? []).join('\n') ||
    formatWeekHours(portal?.hours).join('\n');
  return {
    tagline: contactStringField(portal?.tagline),
    headline: contactStringField(portal?.headline),
    body: typeof portal?.body === 'string' ? portal.body : '',
    fields: portalFieldsWithoutHours(portal?.fields),
    hoursText,
    hoursLines: formatWeekHours(portal?.hours),
  };
}

async function saveClientPortalContent(
  uid: string,
  body: Record<string, unknown>,
  contactData: ContactRecord,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const wants =
    typeof body.tagline === 'string' ||
    typeof body.headline === 'string' ||
    typeof body.body === 'string' ||
    typeof body.hoursText === 'string' ||
    Array.isArray(body.fields);
  if (!wants) return { ok: true };

  const latest = await getContact(uid);
  const existing = (latest.ok ? extractPortal(latest.data) : extractPortal(contactData)) ?? {};
  const next: ClientPortal = { ...existing };

  if (typeof body.tagline === 'string') {
    const tagline = body.tagline.trim();
    if (tagline) next.tagline = tagline;
    else delete next.tagline;
  }
  if (typeof body.headline === 'string') {
    const headline = body.headline.trim();
    if (headline) next.headline = headline;
    else delete next.headline;
  }
  if (typeof body.body === 'string') {
    next.body = body.body;
  }

  let fields = parsePortalOverviewFields(body.fields) ?? [...(existing.fields ?? [])];
  fields = portalFieldsWithoutHours(fields);

  if (typeof body.hoursText === 'string') {
    const text = body.hoursText.trim();
    if (text) fields.unshift({ label: 'Hours', value: text });
    const parsed = parseHoursText(text);
    if (parsed && hasAnyHours(parsed)) next.hours = parsed;
    else if (!text) delete next.hours;
  } else {
    const hours = hoursFieldText(existing);
    if (hours) fields.unshift({ label: 'Hours', value: hours });
  }

  next.fields = fields;
  const saved = await setContactPortal(uid, next);
  if (!saved.ok) return { ok: false, error: saved.error };
  return { ok: true };
}

async function saveClientPortalFields(
  uid: string,
  body: Record<string, unknown>,
  contactData: ContactRecord,
) {
  if (typeof body.kind === 'string' || typeof body.personal === 'boolean') {
    const kind = parseClientKindInput(
      body.kind,
      typeof body.personal === 'boolean' ? body.personal : undefined,
    );
    const saved = await setContactKind(uid, kind);
    if (!saved.ok) return { ok: false as const, error: saved.error };
  }

  // Address before website: website saves can trigger brand/portal enrich that
  // re-spreads portal metadata. Persisting the street address first means those
  // enrichers re-read the selected address instead of the typed query.
  let address = '';
  let geo: ReturnType<typeof parseClientGeoInput> | null = null;
  let addressWriteToken: number | undefined;
  if (typeof body.address === 'string') {
    const geoInput =
      body.geo === null ? null : body.geo != null ? parseClientGeoInput(body.geo) : undefined;
    const writeToken =
      typeof body.addressWriteToken === 'number' && Number.isFinite(body.addressWriteToken)
        ? body.addressWriteToken
        : null;
    const saved = await setClientPortalAddress(uid, body.address, geoInput, writeToken);
    if (!saved.ok) return { ok: false as const, error: saved.error };
    address = saved.address;
    geo = saved.geo ?? null;
    addressWriteToken = saved.addressWriteToken;
  } else {
    const portal = extractPortal(contactData);
    address = contactStringField(portal?.address) || '';
    geo = portal?.geo ?? null;
    addressWriteToken =
      typeof portal?.addressWriteToken === 'number' && Number.isFinite(portal.addressWriteToken)
        ? portal.addressWriteToken
        : undefined;
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

  // If website enrich raced, re-read address so the PATCH response matches DB.
  if (typeof body.address === 'string') {
    const refreshed = await getContact(uid);
    if (refreshed.ok) {
      const portal = extractPortal(refreshed.data);
      address = contactStringField(portal?.address) || address;
      geo = portal?.geo ?? geo;
      addressWriteToken =
        typeof portal?.addressWriteToken === 'number' && Number.isFinite(portal.addressWriteToken)
          ? portal.addressWriteToken
          : addressWriteToken;
    }
  }

  const contentSaved = await saveClientPortalContent(uid, body, contactData);
  if (!contentSaved.ok) return { ok: false as const, error: contentSaved.error };

  return { ok: true as const, website, address, geo, addressWriteToken };
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

export const GET: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const uid = (context.params.uid ?? '').trim();
  if (!uid) return json({ ok: false, error: 'Not found' }, 404);

  if (context.url.searchParams.get('preview') === 'delete') {
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

  void import('../../../lib/contactPortalEnrich')
    .then((m) => m.triggerContactPortalEnrich(uid))
    .catch(() => {});

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
    kind: getClientKind(contact),
    website,
    address: contactStringField(portal?.address) || '',
    addressWriteToken:
      typeof portal?.addressWriteToken === 'number' && Number.isFinite(portal.addressWriteToken)
        ? portal.addressWriteToken
        : undefined,
    geo: portal?.geo ?? null,
    logoUrl,
    iconUrl,
    logoSource: portal?.logoSource,
    iconSource: portal?.iconSource,
    ...clientPortalEditorFields(portal),
    archived: !!contact.archived,
    createdAt: contact.createdAt ?? null,
    data: portal?.data ?? [],
  });
};

export const PATCH: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const uid = (context.params.uid ?? '').trim();
  if (!uid) return json({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
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
    const vaultSaved = await saveClientPortalData(
      uid,
      body.data,
      contact,
      parseVaultKnownIds(body.vaultKnownIds),
    );
    if (!vaultSaved.ok) return json({ ok: false, error: vaultSaved.error }, 400);
    vaultData = vaultSaved.data;
  }

  const branding = await clientPortalBranding(uid);
  const refreshed = await getContact(uid);
  const portal = refreshed.ok ? extractPortal(refreshed.data) : null;
  const savedContact = refreshed.ok ? refreshed.data : contact;

  return json({
    ok: true,
    ...contactSummary(savedContact),
    firstName: contactStringField(contact.firstName),
    lastName: contactStringField(contact.lastName),
    notes: contact.notes ?? '',
    personal: contactIsPersonal(savedContact),
    kind: getClientKind(savedContact),
    website: portalSaved.website,
    address: portalSaved.address,
    addressWriteToken: portalSaved.addressWriteToken,
    geo: portalSaved.geo,
    logoUrl: branding.logoUrl,
    iconUrl: branding.iconUrl,
    logoSource: branding.logoSource,
    iconSource: branding.iconSource,
    ...clientPortalEditorFields(portal),
    archived: !!contact.archived,
    createdAt: contact.createdAt ?? null,
    data: vaultData ?? portal?.data ?? [],
  });
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const uid = (context.params.uid ?? '').trim();
  if (!uid) return json({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
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
    const vaultSaved = await saveClientPortalData(
      uid,
      body.data,
      contact,
      parseVaultKnownIds(body.vaultKnownIds),
    );
    if (!vaultSaved.ok) return json({ ok: false, error: vaultSaved.error }, 400);
    vaultData = vaultSaved.data;
  }

  const branding = await clientPortalBranding(uid);
  const refreshed = await getContact(uid);
  const portal = refreshed.ok ? extractPortal(refreshed.data) : null;
  const savedContact = refreshed.ok ? refreshed.data : contact;

  return json({
    ok: true,
    ...contactSummary(savedContact),
    firstName: contactStringField(contact.firstName),
    lastName: contactStringField(contact.lastName),
    notes: contact.notes ?? '',
    personal: contactIsPersonal(savedContact),
    kind: getClientKind(savedContact),
    website: portalSaved.website,
    address: portalSaved.address,
    addressWriteToken: portalSaved.addressWriteToken,
    geo: portalSaved.geo,
    logoUrl: branding.logoUrl,
    iconUrl: branding.iconUrl,
    logoSource: branding.logoSource,
    iconSource: branding.iconSource,
    ...clientPortalEditorFields(portal),
    archived: !!contact.archived,
    createdAt: contact.createdAt ?? null,
    data: vaultData ?? portal?.data ?? [],
  });
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const uid = (context.params.uid ?? '').trim();
  if (!uid) return json({ ok: false, error: 'Not found' }, 404);

  const force = context.url.searchParams.get('force') === 'true';
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
