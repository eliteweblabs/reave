import type { APIRoute } from 'astro';
import {
  contactSummary,
  extractPortal,
  getContact,
  isContactApiConfigured,
  updateContact,
} from '../../../lib/contactApi';
import { portalSiteUrl } from '../../../lib/siteMonitoring';
import { setClientPortalWebsite, websiteFromNotes } from '../../../lib/clientBrand';
import { getContactDeleteBlockers, executeContactDelete, blockersToJson } from '../../../lib/contactDeleteGuard';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
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

  const portal = extractPortal(res.data);
  const website =
    portal?.website?.trim() ||
    portalSiteUrl(portal) ||
    websiteFromNotes(res.data.notes ?? '') ||
    '';

  return json({
    ok: true,
    ...contactSummary(res.data),
    notes: res.data.notes ?? '',
    website,
    archived: !!res.data.archived,
    createdAt: res.data.createdAt ?? null,
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

  const res = await updateContact(uid, {
    name: typeof body.name === 'string' ? body.name : undefined,
    email: typeof body.email === 'string' ? body.email : body.email == null ? '' : undefined,
    phone: typeof body.phone === 'string' ? body.phone : body.phone == null ? '' : undefined,
    company: typeof body.company === 'string' ? body.company : body.company == null ? '' : undefined,
    notes: typeof body.notes === 'string' ? body.notes : body.notes == null ? '' : undefined,
  });
  if (!res.ok) return json({ ok: false, error: res.error }, res.status ?? 502);

  let website = '';
  if (typeof body.website === 'string') {
    const saved = await setClientPortalWebsite(uid, body.website);
    if (!saved.ok) return json({ ok: false, error: saved.error }, 502);
    website = saved.website;
  } else {
    const portal = extractPortal(res.data);
    website = portal?.website?.trim() || portalSiteUrl(portal) || '';
  }

  return json({
    ok: true,
    ...contactSummary(res.data),
    notes: res.data.notes ?? '',
    website,
    archived: !!res.data.archived,
    createdAt: res.data.createdAt ?? null,
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

  const res = await updateContact(uid, {
    name: typeof body.name === 'string' ? body.name : undefined,
    email: typeof body.email === 'string' ? body.email : body.email == null ? '' : undefined,
    phone: typeof body.phone === 'string' ? body.phone : body.phone == null ? '' : undefined,
    company: typeof body.company === 'string' ? body.company : body.company == null ? '' : undefined,
    notes: typeof body.notes === 'string' ? body.notes : body.notes == null ? '' : undefined,
  });
  if (!res.ok) return json({ ok: false, error: res.error }, res.status ?? 502);

  let website = '';
  if (typeof body.website === 'string') {
    const saved = await setClientPortalWebsite(uid, body.website);
    if (!saved.ok) return json({ ok: false, error: saved.error }, 502);
    website = saved.website;
  } else {
    const portal = extractPortal(res.data);
    website = portal?.website?.trim() || portalSiteUrl(portal) || '';
  }

  return json({
    ok: true,
    ...contactSummary(res.data),
    notes: res.data.notes ?? '',
    website,
    archived: !!res.data.archived,
    createdAt: res.data.createdAt ?? null,
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
