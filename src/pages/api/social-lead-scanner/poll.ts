/**
 * GET/POST /api/social-lead-scanner/poll — scheduled keyword scan (Railway cron or admin).
 *
 * Auth: ?key=<SOCIAL_LEAD_SCANNER_POLL_SECRET> or deployment owner Clerk session.
 * ?force=1 runs even when disabled in settings.
 */
import type { APIRoute } from 'astro';
import {
  ensureSocialLeadScannerScheduler,
  socialLeadScannerPollSecret,
} from '../../../lib/socialLeadScannerScheduler';
import { runSocialLeadScanner } from '../../../lib/socialLeadScannerEngine';
import { authorizePollOrOwner } from '../../../lib/pollRouteAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const key = context.url.searchParams.get('key')?.trim() ?? null;
  const auth = await authorizePollOrOwner(context, key, socialLeadScannerPollSecret);
  if (auth instanceof Response) return auth;

  ensureSocialLeadScannerScheduler();
  const force = context.url.searchParams.get('force') === '1';
  const result = await runSocialLeadScanner({
    force,
    source: auth.via === 'owner' ? 'admin' : 'cron',
  });

  return jsonResponse(result, 200);
};

export const POST: APIRoute = GET;
