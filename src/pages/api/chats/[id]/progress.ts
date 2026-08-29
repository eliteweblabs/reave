import type { APIContext } from 'astro';
import { getAgentProgress } from '../../../../lib/agentProgress';
import { isAgentRunActive } from '../../../../lib/agentRunControl';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import {
  agentRunLeaseToProgress,
  getAliveAgentRunLease,
} from '../../../../lib/pgAgentRunLeases';
import '../../../../lib/processDrain';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const id = context.params.id?.trim();
  if (!id) return jsonResponse({ ok: false, error: 'Missing thread id' }, 400);

  const localProgress = getAgentProgress(userId, id);
  const localRunning = isAgentRunActive(userId, id);
  // Only report a live run when this process still owns it. Leftover progress
  // after the run map is cleared used to keep `running || progress` recovery
  // (and the composer lock) stuck on a finished reply.
  if (localRunning) {
    return jsonResponse({ ok: true, progress: localProgress, running: true });
  }

  // Another replica may still be draining the turn after a deploy cutover.
  const lease = await getAliveAgentRunLease(userId, id);
  if (lease) {
    return jsonResponse({
      ok: true,
      progress: agentRunLeaseToProgress(lease),
      running: true,
    });
  }

  return jsonResponse({ ok: true, progress: null, running: false });
}
