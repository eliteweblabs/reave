/**
 * GET /api/email/sent — outbound mail log for the admin Inbox Sent tab.
 */

import type { APIContext } from 'astro';
import { listOutboundEmails } from '../../../lib/projectOutboundEmail';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const limitRaw = context.url.searchParams.get('limit');
  const limit = Math.min(Math.max(Number(limitRaw) || 200, 1), 500);

  const events = await listOutboundEmails(limit);

  return json({ ok: true, events });
}
