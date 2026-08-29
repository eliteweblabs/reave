/**
 * GET /api/email/sent — outbound mail log for the admin Inbox Sent tab.
 */

import type { APIContext } from 'astro';
import { listOutboundEmails } from '../../../lib/projectOutboundEmail';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const limitRaw = context.url.searchParams.get('limit');
  const limit = Math.min(Math.max(Number(limitRaw) || 200, 1), 500);

  const events = await listOutboundEmails(limit);

  return jsonResponse({ ok: true, events });
}
