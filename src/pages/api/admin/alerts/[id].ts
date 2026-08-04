/**
 * PATCH /api/admin/alerts/[id] — archive/dismiss a push alert notification.
 */

import type { APIContext } from 'astro';
import { storeAckPushAlert } from '../../../../lib/pushAlertStore';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function ackAlert(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = context.params.id?.trim() ?? '';
  if (!id) return json({ ok: false, error: 'Invalid alert id' }, 400);

  const result = await storeAckPushAlert(id);
  if (!result.ok) return json({ ok: false, error: result.error }, 404);
  return json({ ok: true, alertId: result.id });
}

export async function PATCH(context: APIContext): Promise<Response> {
  return ackAlert(context);
}

/** POST alias — some mobile/PWA stacks handle POST more reliably than PATCH. */
export async function POST(context: APIContext): Promise<Response> {
  return ackAlert(context);
}
