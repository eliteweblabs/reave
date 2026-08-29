/**
 * Owner-only chat recovery & diagnostics.
 *
 * GET  /api/admin/chats — list every user_id that owns chat threads, with
 *   counts, so the deployment owner can spot threads orphaned under a previous
 *   Clerk user id (e.g. after a Clerk instance/key rotation or account change).
 * POST /api/admin/chats — { action: 'reassign', from, to? } moves all threads
 *   from an old user id to the current owner's id (default `to` = signed-in id).
 *
 * Chats are keyed strictly on the signed-in Clerk user id. When that id
 * changes, prior threads become invisible even though the person is still the
 * deployment owner. This endpoint lets them reclaim that history.
 */
import type { APIContext } from 'astro';
import { requireDeploymentOwner } from '../../../lib/deploymentOwner';
import { agentAlertUserId } from '../../../lib/adminAgentAlert';
import {
  chatStorageBackend,
  storeListChatThreadOwners,
  storeReassignChatThreads,
} from '../../../lib/chatStore';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  const backend = chatStorageBackend();
  if (backend !== 'postgres') {
    return jsonResponse(
      {
        ok: false,
        error: 'Session recovery requires the Postgres backend (set DATABASE_URL).',
        storage: backend,
      },
      400,
    );
  }

  const owners = await storeListChatThreadOwners();
  if (owners == null) {
    return jsonResponse({ ok: false, error: 'Failed to read session threads.' }, 500);
  }

  const currentUserId = auth.userId;
  return jsonResponse({
    ok: true,
    storage: backend,
    currentUserId,
    agentAlertUserId: agentAlertUserId(),
    owners: owners.map((o) => ({
      userId: o.userId,
      threadCount: o.threadCount,
      latestUpdatedAt: o.latestUpdatedAt,
      isCurrent: o.userId === currentUserId,
    })),
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  const backend = chatStorageBackend();
  if (backend !== 'postgres') {
    return jsonResponse(
      {
        ok: false,
        error: 'Session recovery requires the Postgres backend (set DATABASE_URL).',
        storage: backend,
      },
      400,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const action = String(body.action ?? 'reassign').trim();
  if (action === 'reassign_all') {
    const { storeConsolidateOrphanedChatThreads } = await import('../../../lib/chatStore');
    const moved = await storeConsolidateOrphanedChatThreads(auth.userId);
    return jsonResponse({ ok: true, moved, to: auth.userId });
  }
  if (action !== 'reassign') {
    return jsonResponse({ ok: false, error: `Unknown action: ${action}` }, 400);
  }

  const from = String(body.from ?? '').trim();
  const to = String(body.to ?? '').trim() || auth.userId;
  if (!from) {
    return jsonResponse({ ok: false, error: 'from (old user id) is required' }, 400);
  }
  if (from === to) {
    return jsonResponse({ ok: false, error: 'from and to must be different user ids' }, 400);
  }

  const moved = await storeReassignChatThreads(from, to);
  if (moved == null) {
    return jsonResponse({ ok: false, error: 'Failed to reassign session threads.' }, 500);
  }

  return jsonResponse({ ok: true, moved, from, to });
}
