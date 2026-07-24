/**
 * PATCH /api/admin/alerts/[id] — archive/dismiss a push alert notification.
 */

import type { APIContext } from 'astro';
import { storeAckPushAlert } from '../../../../lib/pushAlertStore';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function PATCH(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const id = context.params.id?.trim() ?? '';
  if (!id) return json({ ok: false, error: 'Invalid alert id' }, 400);

  const result = await storeAckPushAlert(id);
  if (!result.ok) return json({ ok: false, error: result.error }, 404);
  return json({ ok: true, alertId: result.id });
}
