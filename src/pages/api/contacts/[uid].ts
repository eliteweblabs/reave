import type { APIRoute } from 'astro';
import { deleteContact, isContactApiConfigured } from '../../../lib/contactApi';
import { serverEnv } from '../../../lib/serverEnv';

export const prerender = false;

function isDashboardAuthed(request: Request): boolean {
  const expected = serverEnv('DASHBOARD_KEY')?.trim();
  if (!expected) return false;
  return request.headers.get('x-dashboard-key')?.trim() === expected;
}

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const DELETE: APIRoute = async ({ request, params }) => {
  if (!isDashboardAuthed(request)) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isContactApiConfigured()) return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);

  const uid = params.uid?.trim();
  if (!uid) return json({ ok: false, error: 'uid is required' }, 400);

  const result = await deleteContact(uid);
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);
  return json({ ok: true });
};
