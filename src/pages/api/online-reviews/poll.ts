/**
 * GET/POST /api/online-reviews/poll — scheduled Google review sync (Railway cron or admin).
 *
 * Auth: ?key=<ONLINE_REVIEWS_POLL_SECRET> or deployment owner Clerk session.
 * ?force=1 runs even when sync is disabled in Reviews settings.
 */
import type { APIRoute } from 'astro';
import {
  ensureOnlineReviewsScheduler,
  onlineReviewsPollSecret,
  runOnlineReviewsSync,
} from '../../../lib/onlineReviewsScheduler';
import { authorizePollOrOwner } from '../../../lib/pollRouteAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const key = context.url.searchParams.get('key')?.trim() ?? null;
  const auth = await authorizePollOrOwner(context, key, onlineReviewsPollSecret);
  if (auth instanceof Response) return auth;

  ensureOnlineReviewsScheduler();
  const force = context.url.searchParams.get('force') === '1';
  const result = await runOnlineReviewsSync({
    force,
    source: auth.via === 'owner' ? 'admin' : 'cron',
  });

  return jsonResponse(result, 200);
};

export const POST: APIRoute = GET;
