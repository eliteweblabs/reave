/**
 * GET   /api/clients/[uid]/link — list tracked portal share links for a client
 * PATCH /api/clients/[uid]/link — dismiss viewed state or remove a sent-notice on a tracked link
 */
import type { APIContext } from 'astro';
import { getContact, isContactApiConfigured } from '../../../../lib/contactApi';
import {
  deleteTrackedLink,
  dismissTrackedLinkView,
  listTrackedLinksForContact,
} from '../../../../lib/linkTracking';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const uid = context.params.uid?.trim() ?? '';
  if (!uid) return json({ ok: false, error: 'Not found' }, 404);

  const contact = await getContact(uid);
  if (!contact.ok) return json({ ok: false, error: contact.error }, contact.status ?? 404);

  const links = await listTrackedLinksForContact(uid, { limit: 10 });
  return json({ ok: true, links });
}

export async function PATCH(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const uid = context.params.uid?.trim() ?? '';
  if (!uid) return json({ ok: false, error: 'Not found' }, 404);

  const contact = await getContact(uid);
  if (!contact.ok) return json({ ok: false, error: contact.error }, contact.status ?? 404);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const token = String(body.token ?? '').trim();
  if (!token) return json({ ok: false, error: 'token is required' }, 400);

  const links = await listTrackedLinksForContact(uid, { limit: 50 });
  if (!links.some((l) => l.token === token)) {
    return json({ ok: false, error: 'Link not found for this client' }, 404);
  }

  const dismiss = String(body.dismiss ?? 'view').trim();
  if (dismiss === 'sent') {
    const result = await deleteTrackedLink(token);
    if (!result.ok) return json({ ok: false, error: result.error }, 404);
    return json({ ok: true });
  }

  const result = await dismissTrackedLinkView(token);
  if (!result.ok) return json({ ok: false, error: result.error }, 404);
  return json({ ok: true, link: result.link });
}
