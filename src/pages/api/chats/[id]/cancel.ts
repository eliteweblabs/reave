import type { APIContext } from 'astro';
import { json } from '../../../../lib/apiJson';
import { cancelAgentRun, isAgentRunActive } from '../../../../lib/agentRunControl';
import { clearAgentProgress } from '../../../../lib/agentProgress';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;


/** POST /api/chats/:id/cancel — stop an in-flight agent run for this thread. */
export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing thread id' }, 400);

  const cancelled = cancelAgentRun(userId, id);
  clearAgentProgress(userId, id);
  return json({ ok: true, cancelled, running: isAgentRunActive(userId, id) });
}
