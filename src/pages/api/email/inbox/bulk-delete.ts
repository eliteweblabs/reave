/**
 * POST /api/email/inbox/bulk-delete — remove multiple messages from the inbox log.
 * Body: { ids: string[] }
 */

import type { APIContext } from 'astro';
import { storeDeleteEmailInboxMany } from '../../../../lib/emailInboxStore';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

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

  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>).ids : null;
  if (!Array.isArray(raw) || raw.length === 0) {
    return json({ ok: false, error: 'ids must be a non-empty array' }, 400);
  }
  if (raw.length > 500) {
    return json({ ok: false, error: 'Too many ids (max 500)' }, 400);
  }

  const ids = raw.map((id) => String(id).trim()).filter(Boolean);
  if (!ids.length) return json({ ok: false, error: 'No valid ids' }, 400);

  const deleted = await storeDeleteEmailInboxMany(ids);
  return json({ ok: true, deleted, requested: ids.length });
}
