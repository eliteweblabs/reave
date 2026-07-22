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

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  const backend = chatStorageBackend();
  if (backend !== 'postgres') {
    return json(
      {
        ok: false,
        error: 'Chat recovery requires the Postgres backend (set DATABASE_URL).',
        storage: backend,
      },
      400,
    );
  }

  const owners = await storeListChatThreadOwners();
  if (owners == null) {
    return json({ ok: false, error: 'Failed to read chat threads.' }, 500);
  }

  const currentUserId = auth.userId;
  return json({
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
    return json(
      {
        ok: false,
        error: 'Chat recovery requires the Postgres backend (set DATABASE_URL).',
        storage: backend,
      },
      400,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const action = String(body.action ?? 'reassign').trim();
  if (action !== 'reassign') {
    return json({ ok: false, error: `Unknown action: ${action}` }, 400);
  }

  const from = String(body.from ?? '').trim();
  const to = String(body.to ?? '').trim() || auth.userId;
  if (!from) {
    return json({ ok: false, error: 'from (old user id) is required' }, 400);
  }
  if (from === to) {
    return json({ ok: false, error: 'from and to must be different user ids' }, 400);
  }

  const moved = await storeReassignChatThreads(from, to);
  if (moved == null) {
    return json({ ok: false, error: 'Failed to reassign chat threads.' }, 500);
  }

  return json({ ok: true, moved, from, to });
}
