import type { APIContext } from 'astro';
import { listActiveRunThreadIds } from '../../../lib/agentRunControl';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { listAliveAgentRunThreadIds } from '../../../lib/pgAgentRunLeases';
import '../../../lib/processDrain';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


/**
 * GET /api/chats/running — thread ids with an in-flight agent run for the
 * signed-in user. Merges this process's in-memory registry with durable leases
 * so the sidebar "working…" indicator survives a Railway deploy cutover while
 * the draining replica finishes the turn.
 */
export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const local = listActiveRunThreadIds(userId);
  const leased = await listAliveAgentRunThreadIds(userId);
  const running = Array.from(new Set([...local, ...leased]));
  return jsonResponse({ ok: true, running });
}
