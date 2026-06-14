import type { APIRoute } from 'astro';
import { createContact, isContactApiConfigured } from '../../../lib/contactApi';
import { serverEnv } from '../../../lib/serverEnv';

export const prerender = false;

function isDashboardAuthed(request: Request): boolean {
  const expected = serverEnv('DASHBOARD_KEY')?.trim();
  if (!expected) return false;
  const auth = request.headers.get('x-dashboard-key')?.trim();
  return auth === expected;
}

export const POST: APIRoute = async ({ request }) => {
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  if (!isDashboardAuthed(request)) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const raw = body as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) {
    return json({ ok: false, error: 'name is required' }, 400);
  }

  const result = await createContact({
    name,
    email: typeof raw.email === 'string' ? raw.email.trim() || undefined : undefined,
    phone: typeof raw.phone === 'string' ? raw.phone.trim() || undefined : undefined,
    company: typeof raw.company === 'string' ? raw.company.trim() || undefined : undefined,
    notes: typeof raw.notes === 'string' ? raw.notes.trim() || undefined : undefined,
  });

  if (!result.ok) {
    return json({ ok: false, error: result.error }, result.status ?? 502);
  }

  return json({ ok: true, contact: result.data }, 201);
};
