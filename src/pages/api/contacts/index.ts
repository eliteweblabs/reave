import type { APIRoute } from 'astro';
import { createContact, isContactApiConfigured } from '../../../lib/contactApi';
import { serverEnv } from '../../../lib/serverEnv';
import { secretMatches } from '../../../lib/secretCompare';
import { checkInMemoryRateLimit } from '../../../lib/inMemoryRateLimit';
import { clientIp } from '../../../lib/clientIp';

export const prerender = false;

function isDashboardAuthed(request: Request): boolean {
  const expected = serverEnv('DASHBOARD_KEY')?.trim();
  if (!expected) return false;
  const auth = request.headers.get('x-dashboard-key');
  return secretMatches(auth, expected);
}

function rateLimited(request: Request): Response | null {
  const rate = checkInMemoryRateLimit(`contacts:${clientIp(request)}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 30,
  });
  if (!rate.ok) {
    return new Response(JSON.stringify({ ok: false, error: 'Too many requests. Please try again later.' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(rate.retryAfterSeconds),
      },
    });
  }
  return null;
}

export const POST: APIRoute = async ({ request }) => {
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  if (!isDashboardAuthed(request)) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const limited = rateLimited(request);
  if (limited) return limited;

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

  // Fire the welcome/follow-up automations (non-blocking).
  void import('../../../lib/newsletterEngine')
    .then((m) => m.onContactCreated(result.data))
    .catch((e) => console.warn('[newsletter] onContactCreated failed', e));
  void import('../../../lib/contactPortalEnrich')
    .then((m) => m.triggerContactPortalEnrich(result.data.uid))
    .catch((e) => console.warn('[contactPortalEnrich] trigger failed', e));

  return json({ ok: true, contact: result.data }, 201);
};
