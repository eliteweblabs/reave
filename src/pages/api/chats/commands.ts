/**
 * GET /api/chats/commands — slash commands available for the current deployment.
 */
import type { APIContext } from 'astro';
import { listEnabledHelperCommands } from '../../../lib/agentHelperCommands.server';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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
