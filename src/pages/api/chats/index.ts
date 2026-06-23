/**
 * GET  /api/chats — list chat threads for the signed-in user
 * POST /api/chats — create a new empty thread
 */

import type { APIContext } from 'astro';
import {
  dbCreateChatThread,
  dbListChatThreads,
  isSupabaseChatsConfigured,
} from '../../../lib/supabaseChats';

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
  if (!isSupabaseChatsConfigured()) {
    return json({ ok: false, error: 'Supabase not configured — add SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY' }, 503);
  }

  const threads = await dbListChatThreads(userId);
  if (!threads) return json({ ok: false, error: 'Failed to load chats' }, 500);
  return json({ ok: true, threads });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isSupabaseChatsConfigured()) {
    return json({ ok: false, error: 'Supabase not configured — add SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY' }, 503);
  }

  const thread = await dbCreateChatThread(userId);
  if (!thread) return json({ ok: false, error: 'Failed to create chat' }, 500);
  return json({ ok: true, thread });
}
