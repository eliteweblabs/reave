import type { APIContext } from 'astro';
import { cancelAgentRun, isAgentRunActive } from '../../../../lib/agentRunControl';
import { clearAgentProgress } from '../../../../lib/agentProgress';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

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
