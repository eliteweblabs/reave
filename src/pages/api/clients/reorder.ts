/**
 * POST /api/clients/reorder — persist manual client sidebar order { uids: string[] }
 */

import type { APIContext } from 'astro';
import { contactSummary, isContactApiConfigured, listContacts } from '../../../lib/contactApi';
import { storeGetSidebarOrder, storeReorderSidebarList, sortBySidebarOrder } from '../../../lib/sidebarOrderStore';

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
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const rawUids = body.uids ?? body.ids;
  if (!Array.isArray(rawUids)) return json({ ok: false, error: 'uids array required' }, 400);

  const uids = rawUids.map((u) => String(u).trim()).filter(Boolean);
  if (uids.length === 0) return json({ ok: false, error: 'uids array required' }, 400);

  const result = await storeReorderSidebarList('clients', uids);
  if (!result.ok) return json({ ok: false, error: result.error }, 400);

  const listResult = await listContacts({ limit: 200 });
  if (!listResult.ok) return json({ ok: false, error: listResult.error }, listResult.status ?? 502);

  const clients = listResult.data.contacts.filter((c) => !c.archived).map(contactSummary);
  const orderMap = await storeGetSidebarOrder('clients');
  const sorted = sortBySidebarOrder(
    clients,
    orderMap,
    (c) => c.uid,
    (a, b) => a.name.localeCompare(b.name),
  );

  return json({ ok: true, clients: sorted, total: listResult.data.total });
}
