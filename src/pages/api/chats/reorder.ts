/**
 * POST /api/chats/reorder — persist manual chat sidebar order { ids: string[] }
 */

import type { APIContext } from 'astro';
import { storeListChatThreadsForOwner } from '../../../lib/chatOwnerAccess';
import { chatStorageBackend } from '../../../lib/chatStore';
import { storeGetSidebarOrder, storeReorderSidebarList, sortBySidebarOrder } from '../../../lib/sidebarOrderStore';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

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

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const rawIds = body.ids;
  if (!Array.isArray(rawIds)) return json({ ok: false, error: 'ids array required' }, 400);

  const ids = rawIds.map((id) => String(id).trim()).filter(Boolean);
  if (ids.length === 0) return json({ ok: false, error: 'ids array required' }, 400);

  const result = await storeReorderSidebarList('chats', ids);
  if (!result.ok) return json({ ok: false, error: result.error }, 400);

  const threads = await storeListChatThreadsForOwner(userId);
  const orderMap = await storeGetSidebarOrder('chats');
  const sorted = sortBySidebarOrder(
    threads.threads,
    orderMap,
    (t) => t.id,
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  return json({ ok: true, threads: sorted, storage: chatStorageBackend() });
}
