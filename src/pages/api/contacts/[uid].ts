import type { APIRoute } from 'astro';
import { isContactApiConfigured, getContact, updateContact } from '../../../lib/contactApi';
import {
  executeContactDelete,
  getContactDeleteBlockers,
  blockersToJson,
} from '../../../lib/contactDeleteGuard';
import { syncContactToCrater } from '../../../lib/contactCraterSync';
import { authorizeContactRoute } from '../../../lib/contactRouteAuth';
import { jsonResponse, readJsonBody } from '../../../lib/apiResponse';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await authorizeContactRoute(context);
  if (auth instanceof Response) return auth;
  const { params, url } = context;
  if (!isContactApiConfigured()) {
    return jsonResponse({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const uid = params.uid?.trim();
  if (!uid) return jsonResponse({ ok: false, error: 'uid is required' }, 400);

  if (url.searchParams.get('preview') === 'delete') {
    const blockers = await getContactDeleteBlockers(uid);
    if (!blockers.ok) return jsonResponse({ ok: false, error: blockers.error }, 404);
    return jsonResponse({ ok: true, ...blockersToJson(blockers.data) });
  }

  return jsonResponse({ ok: false, error: 'Not found' }, 404);
};

export const PATCH: APIRoute = async (context) => {
  const auth = await authorizeContactRoute(context);
  if (auth instanceof Response) return auth;
  const { request, params } = context;
  if (!isContactApiConfigured()) {
    return jsonResponse({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const uid = params.uid?.trim();
  if (!uid) return jsonResponse({ ok: false, error: 'uid is required' }, 400);

  const parsed = await readJsonBody(request);
  if (parsed instanceof Response) return parsed;
  const body = parsed.body;

  const previous = await getContact(uid);
  if (!previous.ok) return jsonResponse({ ok: false, error: previous.error }, previous.status ?? 404);

  const result = await updateContact(uid, {
    name: typeof body.name === 'string' ? body.name : undefined,
    email: typeof body.email === 'string' ? body.email : body.email == null ? '' : undefined,
    phone: typeof body.phone === 'string' ? body.phone : body.phone == null ? '' : undefined,
    company: typeof body.company === 'string' ? body.company : body.company == null ? '' : undefined,
    notes: typeof body.notes === 'string' ? body.notes : body.notes == null ? '' : undefined,
  });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, result.status ?? 502);

  const craterSync = await syncContactToCrater(previous.data, result.data);

  return jsonResponse({
    ok: true,
    contact: result.data,
    crater_sync: craterSync.ok
      ? craterSync.synced
        ? { customerId: craterSync.customerId, customerName: craterSync.customerName }
        : null
      : { error: craterSync.error },
  });
};

export const DELETE: APIRoute = async (context) => {
  const auth = await authorizeContactRoute(context);
  if (auth instanceof Response) return auth;
  const { params, url } = context;
  if (!isContactApiConfigured()) {
    return jsonResponse({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const uid = params.uid?.trim();
  if (!uid) return jsonResponse({ ok: false, error: 'uid is required' }, 400);

  const force = url.searchParams.get('force') === 'true';
  const result = await executeContactDelete(uid, { force, permanent: force });
  if (!result.ok) {
    const payload: Record<string, unknown> = { ok: false, error: result.error };
    if (result.blockers) Object.assign(payload, blockersToJson(result.blockers));
    return jsonResponse(payload, result.status ?? 502);
  }
  return jsonResponse({
    ok: true,
    contact_name: result.contact_name,
    deleted_projects: result.deleted_projects,
    already_archived: result.already_archived ?? false,
    permanent: result.permanent ?? false,
  });
};
