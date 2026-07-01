import type { APIContext } from 'astro';
import { getContact } from '../../../../lib/contactApi';
import { sendPortalLink } from '../../../../lib/portalDelivery';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * POST /api/clients/:uid/send-portal — admin-only.
 * Body: { channel: 'email' | 'sms' | 'auto', message?: string, tab?: string }
 */
export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth?.() ?? {};
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const uid = (context.params.uid ?? '').trim();
  if (!uid) return json({ ok: false, error: 'Not found' }, 404);

  let body: { channel?: string; message?: string; tab?: string; carrier?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const channelRaw = body.channel ?? 'auto';
  const channel =
    channelRaw === 'sms' ? 'sms' : channelRaw === 'email' ? 'email' : channelRaw === 'auto' ? 'auto' : null;
  if (!channel) return json({ ok: false, error: 'channel must be "email", "sms", or "auto"' }, 400);

  const contactRes = await getContact(uid);
  if (!contactRes.ok) return json({ ok: false, error: contactRes.error }, contactRes.status ?? 404);

  const message = typeof body.message === 'string' ? body.message : undefined;
  const tab = typeof body.tab === 'string' ? body.tab : undefined;
  const carrier = typeof body.carrier === 'string' ? body.carrier.trim() : undefined;

  const result = await sendPortalLink({
    contact: contactRes.data,
    channel,
    message,
    tab,
    carrier,
  });

  if (!result.ok) return json(result, 400);
  return json(result);
}
