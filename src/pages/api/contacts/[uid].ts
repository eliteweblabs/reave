import type { APIRoute } from 'astro';
import { isContactApiConfigured, updateContact } from '../../../lib/contactApi';
import {
  executeContactDelete,
  getContactDeleteBlockers,
  blockersToJson,
} from '../../../lib/contactDeleteGuard';
import { serverEnv } from '../../../lib/serverEnv';

export const prerender = false;

function isDashboardAuthed(request: Request): boolean {
  const expected = serverEnv('DASHBOARD_KEY')?.trim();
  if (!expected) return false;
  return request.headers.get('x-dashboard-key')?.trim() === expected;
}

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ request, params, url }) => {
  if (!isDashboardAuthed(request)) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isContactApiConfigured()) return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);

  const uid = params.uid?.trim();
  if (!uid) return json({ ok: false, error: 'uid is required' }, 400);

  if (url.searchParams.get('preview') === 'delete') {
    const blockers = await getContactDeleteBlockers(uid);
    if (!blockers.ok) return json({ ok: false, error: blockers.error }, 404);
    return json({ ok: true, ...blockersToJson(blockers.data) });
  }

  return json({ ok: false, error: 'Not found' }, 404);
};

export const PATCH: APIRoute = async ({ request, params }) => {
  if (!isDashboardAuthed(request)) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isContactApiConfigured()) return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);

  const uid = params.uid?.trim();
  if (!uid) return json({ ok: false, error: 'uid is required' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const result = await updateContact(uid, {
    name: typeof body.name === 'string' ? body.name : undefined,
    email: typeof body.email === 'string' ? body.email : body.email == null ? '' : undefined,
    phone: typeof body.phone === 'string' ? body.phone : body.phone == null ? '' : undefined,
    company: typeof body.company === 'string' ? body.company : body.company == null ? '' : undefined,
    notes: typeof body.notes === 'string' ? body.notes : body.notes == null ? '' : undefined,
  });
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);
  return json({ ok: true, contact: result.data });
};

export const DELETE: APIRoute = async ({ request, params, url }) => {
  if (!isDashboardAuthed(request)) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isContactApiConfigured()) return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);

  const uid = params.uid?.trim();
  if (!uid) return json({ ok: false, error: 'uid is required' }, 400);

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
