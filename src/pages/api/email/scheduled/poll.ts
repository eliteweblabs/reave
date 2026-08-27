/**
 * GET/POST /api/email/scheduled/poll — cron or owner flush of due correspondence.
 *
 * Auth: ?key=<EMAIL_SCHEDULED_POLL_SECRET or NEWSLETTER_POLL_SECRET> or owner session.
 */

import type { APIRoute } from 'astro';
import { processDueScheduledEmails } from '../../../../lib/emailScheduledSend';
import {
  emailScheduledPollSecret,
  ensureEmailScheduledScheduler,
} from '../../../../lib/emailScheduledScheduler';
import { authorizePollOrOwner } from '../../../../lib/pollRouteAuth';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async (context) => {
  const key = context.url.searchParams.get('key')?.trim() ?? null;
  const auth = await authorizePollOrOwner(context, key, emailScheduledPollSecret);
  if (auth instanceof Response) return auth;

  ensureEmailScheduledScheduler();
  const result = await processDueScheduledEmails(200);
  return json(result);
};

export const POST: APIRoute = GET;
