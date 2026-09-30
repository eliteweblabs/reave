import type { APIRoute } from 'astro';
import { createContact, isContactApiConfigured } from '../../../lib/contactApi';
import { authorizeContactRoute } from '../../../lib/contactRouteAuth';
import { jsonResponse, readJsonBody } from '../../../lib/apiResponse';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const auth = await authorizeContactRoute(context);
  if (auth instanceof Response) return auth;

  if (!isContactApiConfigured()) {
    return jsonResponse({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const parsed = await readJsonBody(context.request);
  if (parsed instanceof Response) return parsed;
  const raw = parsed.body;

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) {
    return jsonResponse({ ok: false, error: 'name is required' }, 400);
  }

  const result = await createContact({
    name,
    email: typeof raw.email === 'string' ? raw.email.trim() || undefined : undefined,
    phone: typeof raw.phone === 'string' ? raw.phone.trim() || undefined : undefined,
    company: typeof raw.company === 'string' ? raw.company.trim() || undefined : undefined,
    notes: typeof raw.notes === 'string' ? raw.notes.trim() || undefined : undefined,
  });

  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error }, result.status ?? 502);
  }

  // Fire the welcome/follow-up automations (non-blocking).
  void import('../../../lib/newsletterEngine')
    .then((m) => m.onContactCreated(result.data))
    .catch((e) => console.warn('[newsletter] onContactCreated failed', e));
  void import('../../../lib/contactPortalEnrich')
    .then((m) => m.triggerContactPortalEnrich(result.data.uid))
    .catch((e) => console.warn('[contactPortalEnrich] trigger failed', e));

  return jsonResponse({ ok: true, contact: result.data }, 201);
};
