/**
 * POST /api/uptime/poll — manual or cron-triggered API sync.
 *
 * Auth: ?key=<UPTIMEROBOT_POLL_SECRET> (falls back to UPTIMEROBOT_WEBHOOK_SECRET)
 * or Clerk session for admin users.
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../lib/features';
import { runUptimePoll, uptimePollSecret, ensureUptimePollScheduler } from '../../../lib/uptimePollScheduler';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function authorizedByKey(key: string | null): boolean {
  const expected = uptimePollSecret();
  return Boolean(expected && key && key === expected);
}

export const GET: APIRoute = async ({ url, locals }) => {
  const key = url.searchParams.get('key')?.trim() ?? null;
  const { userId } = locals.auth();
  if (!userId && !authorizedByKey(key)) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }
  if (!hasFeature('uptime_monitoring')) {
    return json({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }
  ensureUptimePollScheduler();
  const result = await runUptimePoll();
  if (!result.ok) return json({ ...result, ok: false }, result.error ? 503 : 500);
  return json({ ok: true, synced: result.synced });
};

export const POST: APIRoute = GET;
