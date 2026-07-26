import type { APIContext } from 'astro';
import { listActiveRunThreadIds } from '../../../lib/agentRunControl';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * GET /api/chats/running — thread ids with an in-flight agent run for the
 * signed-in user. Backed entirely by the in-memory run registry (no DB hit),
 * so the sidebar can poll this frequently to drive a live "working…"
 * indicator without the cost of re-fetching full thread data every tick.
 */
export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  return json({ ok: true, running: listActiveRunThreadIds(userId) });
}
