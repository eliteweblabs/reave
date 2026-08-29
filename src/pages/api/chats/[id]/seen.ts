import type { APIContext } from 'astro';
import { resolveChatThreadOwnerUserId } from '../../../../lib/chatOwnerAccess';
import { storeMarkChatSeen } from '../../../../lib/chatStore';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


/**
 * POST /api/chats/:id/seen — record that the signed-in user has seen this
 * thread as of `seenAt` (defaults to now). Stored server-side so the sidebar
 * "unread" dot agrees across every device signed in as this user, instead of
 * each browser/app tracking its own private (localStorage) read state.
 */
export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const id = context.params.id?.trim();
  if (!id) return jsonResponse({ ok: false, error: 'Missing thread id' }, 400);

  let seenAt: string | undefined;
  try {
    const text = await context.request.text();
    if (text.trim()) {
      const body = JSON.parse(text) as Record<string, unknown>;
      const raw = String(body.seenAt ?? '').trim();
      if (raw) seenAt = raw;
    }
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const ownerUserId = await resolveChatThreadOwnerUserId(userId, id);
  if (!ownerUserId) return jsonResponse({ ok: false, error: 'Session not found' }, 404);

  const lastSeenAt = await storeMarkChatSeen(ownerUserId, id, seenAt);
  return jsonResponse({ ok: true, id, last_seen_at: lastSeenAt });
}
