import type { APIRoute } from 'astro';
import { deleteContact, isContactApiConfigured, updateContact } from '../../../lib/contactApi';
import { getContactDeleteBlockers } from '../../../lib/contactDeleteGuard';
import { serverEnv } from '../../../lib/serverEnv';

export const prerender = false;

function isDashboardAuthed(request: Request): boolean {
  const expected = serverEnv('DASHBOARD_KEY')?.trim();
  if (!expected) return false;
  return request.headers.get('x-dashboard-key')?.trim() === expected;
}

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

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
  const blockers = await getContactDeleteBlockers(uid);
  if (!blockers.ok) return json({ ok: false, error: blockers.error }, 404);

  const { job_count, invoice_count, name } = blockers.data;
  if ((job_count > 0 || invoice_count > 0) && !force) {
    return json(
      {
        ok: false,
        error: 'Contact has linked jobs or invoices',
        job_count,
        invoice_count,
        contact_name: name,
        hint: 'Re-send DELETE with ?force=true to confirm.',
      },
      409,
    );
  }

  const result = await deleteContact(uid);
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);
  return json({ ok: true, contact_name: name });
};
