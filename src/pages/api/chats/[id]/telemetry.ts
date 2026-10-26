/**
 * POST /api/chats/:id/telemetry — client recovery / stream beacons (auth required).
 */
import type { APIContext } from 'astro';
import { resolveChatThreadOwnerUserId } from '../../../../lib/chatOwnerAccess';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { isChatTurnClientEvent } from '../../../../lib/chatTurnRecovery';
import { recordChatTurnEvent } from '../../../../lib/chatTurnEvents';
import '../../../../lib/processDrain';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const id = context.params.id?.trim();
  if (!id) return jsonResponse({ ok: false, error: 'Missing thread id' }, 400);

  let body: { event?: string; detail?: Record<string, unknown> } = {};
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const event = typeof body.event === 'string' ? body.event.trim() : '';
  if (!event || !isChatTurnClientEvent(event)) {
    return jsonResponse({ ok: false, error: 'Unknown event' }, 400);
  }

  const ownerUserId = await resolveChatThreadOwnerUserId(userId, id);
  if (!ownerUserId) return jsonResponse({ ok: false, error: 'Session not found' }, 404);

  const detail =
    body.detail && typeof body.detail === 'object' && !Array.isArray(body.detail)
      ? body.detail
      : null;

  recordChatTurnEvent(userId, id, event, { source: 'client', detail });

  return jsonResponse({ ok: true });
}
