/**
 * GET /api/email/sent — outbound mail log for the admin Inbox Sent tab.
 */

import type { APIContext } from 'astro';
import { listOutboundEmails } from '../../../lib/projectOutboundEmail';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

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

  const limitRaw = context.url.searchParams.get('limit');
  const limit = Math.min(Math.max(Number(limitRaw) || 200, 1), 500);

  const events = await listOutboundEmails(limit);

  return json({ ok: true, events });
}
