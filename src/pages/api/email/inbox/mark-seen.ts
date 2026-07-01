/**
 * POST /api/email/inbox/mark-seen — mark messages seen after scroll-into-view in the inbox list.
 */

import type { APIContext } from 'astro';
import { storeMarkEmailInboxSeenMany } from '../../../../lib/emailInboxStore';

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
