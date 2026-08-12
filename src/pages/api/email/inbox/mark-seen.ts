/**
 * POST /api/email/inbox/mark-seen — mark messages seen after scroll-into-view in the inbox list.
 */

import type { APIContext } from 'astro';
import { json } from '../../../../lib/apiJson';
import { storeMarkEmailInboxSeenMany } from '../../../../lib/emailInboxStore';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;


export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const ids = Array.isArray((body as { ids?: unknown })?.ids)
    ? (body as { ids: unknown[] }).ids.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (!ids.length) return json({ ok: false, error: 'Missing ids' }, 400);

  const marked = await storeMarkEmailInboxSeenMany(ids);
  return json({ ok: true, marked });
}
