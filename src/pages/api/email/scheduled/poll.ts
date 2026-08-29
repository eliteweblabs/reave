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
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


export const GET: APIRoute = async (context) => {
  const key = context.url.searchParams.get('key')?.trim() ?? null;
  const auth = await authorizePollOrOwner(context, key, emailScheduledPollSecret);
  if (auth instanceof Response) return auth;

  ensureEmailScheduledScheduler();
  const result = await processDueScheduledEmails(200);
  return jsonResponse(result);
};

export const POST: APIRoute = GET;
