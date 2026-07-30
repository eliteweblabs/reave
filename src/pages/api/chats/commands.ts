/**
 * GET /api/chats/commands — slash commands available for the current deployment.
 */
import type { APIContext } from 'astro';
import { listEnabledHelperCommands } from '../../../lib/agentHelperCommands.server';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const commands = listEnabledHelperCommands().map((cmd) => ({
    slash: cmd.slash,
    summary: cmd.summary,
    template: cmd.template,
  }));

  return new Response(JSON.stringify({ ok: true, commands }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
