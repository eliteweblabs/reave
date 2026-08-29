/**
 * GET/POST /api/newsletter/poll — manual or cron-triggered send of due emails.
 *
 * Auth: ?key=<NEWSLETTER_POLL_SECRET> or deployment owner Clerk session.
 * ?force=1 sends due emails even outside the configured send window.
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../lib/features';
import { processDueNewsletterSends } from '../../../lib/newsletterEngine';
import { ensureNewsletterScheduler, newsletterPollSecret } from '../../../lib/newsletterScheduler';
import { authorizePollOrOwner } from '../../../lib/pollRouteAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export const GET: APIRoute = async (context) => {
  const key = context.url.searchParams.get('key')?.trim() ?? null;
  const auth = await authorizePollOrOwner(context, key, newsletterPollSecret);
  if (auth instanceof Response) return auth;

  if (!hasFeature('email_marketing')) {
    return jsonResponse({ ok: false, error: 'email_marketing not enabled' }, 404);
  }
  ensureNewsletterScheduler();
  const force = context.url.searchParams.get('force') === '1';
  const result = await processDueNewsletterSends({ limit: 200, ignoreWindow: force });
  return jsonResponse(result, result.ok ? 200 : 503);
};

export const POST: APIRoute = GET;
