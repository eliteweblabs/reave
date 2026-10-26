/**
 * GET /api/admin/chat-turn-events — recent chat turn telemetry (deployment owner).
 */
import type { APIContext } from 'astro';
import { requireDeploymentOwner } from '../../../lib/deploymentOwner';
import { chatStorageBackend } from '../../../lib/chatStore';
import { listRecentChatTurnEvents } from '../../../lib/chatTurnEvents';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  if (chatStorageBackend() !== 'postgres') {
    return jsonResponse(
      {
        ok: false,
        error: 'Chat turn events require Postgres (DATABASE_URL).',
        storage: chatStorageBackend(),
      },
      400,
    );
  }

  const limitRaw = context.url.searchParams.get('limit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 100;
  const events = await listRecentChatTurnEvents(Number.isFinite(limit) ? limit : 100);

  return jsonResponse({ ok: true, events });
}
