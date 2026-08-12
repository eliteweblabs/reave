/**
 * POST /api/uptime/poll — manual or cron-triggered API sync.
 *
 * Auth: ?key=<UPTIMEROBOT_POLL_SECRET> (falls back to UPTIMEROBOT_WEBHOOK_SECRET)
 * or deployment owner Clerk session.
 */
import type { APIRoute } from 'astro';
import { json } from '../../../lib/apiJson';
import { hasFeature } from '../../../lib/features';
import { runUptimePoll, uptimePollSecret, ensureUptimePollScheduler } from '../../../lib/uptimePollScheduler';
import { authorizePollOrOwner } from '../../../lib/pollRouteAuth';

export const prerender = false;


export const GET: APIRoute = async (context) => {
  const key = context.url.searchParams.get('key')?.trim() ?? null;
  const auth = await authorizePollOrOwner(context, key, uptimePollSecret);
  if (auth instanceof Response) return auth;

  if (!hasFeature('uptime_monitoring')) {
    return json({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }
  ensureUptimePollScheduler();
  const result = await runUptimePoll();
  if (!result.ok) return json({ ...result, ok: false }, result.error ? 503 : 500);
  return json({ ok: true, synced: result.synced });
};

export const POST: APIRoute = GET;
