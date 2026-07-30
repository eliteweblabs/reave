/**
 * POST /api/email/inbox/[id]/unsubscribe — RFC 8058 one-click unsubscribe for an inbound message.
 */

import type { APIContext } from 'astro';
import { storeGetEmailInbox } from '../../../../../lib/emailInboxStore';
import { parseEmailUnsubscribe, performEmailUnsubscribe } from '../../../../../lib/emailUnsubscribe';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing id' }, 400);

  const event = await storeGetEmailInbox(id);
  if (!event) return json({ ok: false, error: 'Not found' }, 404);

  const unsubscribe = parseEmailUnsubscribe(event.headers);
  if (!unsubscribe.available) {
    return json(
      { ok: false, error: 'This message does not support one-click unsubscribe.' },
      400,
    );
  }

  const result = await performEmailUnsubscribe(event.headers);
  if (!result.ok) {
    return json({ ok: false, error: result.error || 'Unsubscribe failed.' }, 502);
  }

  return json({ ok: true });
}
