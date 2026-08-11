import type { APIContext } from 'astro';
import { json } from '../../../../lib/apiJson';
import { getAgentProgress } from '../../../../lib/agentProgress';
import { isAgentRunActive } from '../../../../lib/agentRunControl';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import {
  agentRunLeaseToProgress,
  getAliveAgentRunLease,
} from '../../../../lib/pgAgentRunLeases';
import '../../../../lib/processDrain';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing thread id' }, 400);

  const localProgress = getAgentProgress(userId, id);
  const localRunning = isAgentRunActive(userId, id);
  if (localRunning || localProgress) {
    return json({ ok: true, progress: localProgress, running: localRunning });
  }

  // Another replica may still be draining the turn after a deploy cutover.
  const lease = await getAliveAgentRunLease(userId, id);
  if (lease) {
    return json({
      ok: true,
      progress: agentRunLeaseToProgress(lease),
      running: true,
    });
  }

  return json({ ok: true, progress: null, running: false });
}
