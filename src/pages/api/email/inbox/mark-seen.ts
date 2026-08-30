/**
 * POST /api/email/inbox/mark-seen — mark messages seen after the detail pane was opened.
 */

import type { APIContext } from 'astro';
import { storeMarkEmailInboxSeenMany } from '../../../../lib/emailInboxStore';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const ids = Array.isArray((body as { ids?: unknown })?.ids)
    ? (body as { ids: unknown[] }).ids.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (!ids.length) return jsonResponse({ ok: false, error: 'Missing ids' }, 400);

  const marked = await storeMarkEmailInboxSeenMany(ids);
  return jsonResponse({ ok: true, marked });
}
