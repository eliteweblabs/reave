/**
 * PATCH /api/admin/engagement/[id] — dismiss an engagement notification.
 */

import type { APIContext } from 'astro';
import { storeAckEngagementEvent } from '../../../../lib/engagementStore';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function PATCH(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const id = context.params.id?.trim() ?? '';
  if (!id) return json({ ok: false, error: 'Invalid engagement id' }, 400);

  const result = await storeAckEngagementEvent(id);
  if (!result.ok) return json({ ok: false, error: result.error }, 404);
  return json({ ok: true, engagementId: result.id });
}
