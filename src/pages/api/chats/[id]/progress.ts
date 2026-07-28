import type { APIContext } from 'astro';
import { getAgentProgress } from '../../../../lib/agentProgress';
import { isAgentRunActive } from '../../../../lib/agentRunControl';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing thread id' }, 400);

  const progress = getAgentProgress(userId, id);
  const running = isAgentRunActive(userId, id);
  return json({ ok: true, progress, running });
}
