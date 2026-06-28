/**
 * GET  /api/chats — list chat threads for the signed-in user
 * POST /api/chats — create a new empty thread
 */

import type { APIContext } from 'astro';
import { chatStorageBackend, storeCreateChatThread, storeListChatThreads } from '../../../lib/chatStore';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const archivedOnly = context.url.searchParams.get('archived') === '1';
  const threads = await storeListChatThreads(userId, { archivedOnly });
  return json({ ok: true, threads, storage: chatStorageBackend() });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const thread = await storeCreateChatThread(userId);
  if (!thread) return json({ ok: false, error: 'Failed to create chat' }, 500);
  return json({ ok: true, thread, storage: chatStorageBackend() });
}
