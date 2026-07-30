/**
 * POST /api/uptime/poll — manual or cron-triggered API sync.
 *
 * Auth: ?key=<UPTIMEROBOT_POLL_SECRET> (falls back to UPTIMEROBOT_WEBHOOK_SECRET)
 * or Clerk session for admin users.
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../lib/features';
import { runUptimePoll, uptimePollSecret, ensureUptimePollScheduler } from '../../../lib/uptimePollScheduler';
import { secretMatches } from '../../../lib/secretCompare';
import { requireDeploymentOwner } from '../../../lib/deploymentOwner';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function authorizedByKey(key: string | null): boolean {
  const expected = uptimePollSecret();
  return secretMatches(key, expected);
}

export const GET: APIRoute = async (context) => {
  const { url } = context;
  const key = url.searchParams.get('key')?.trim() ?? null;
  if (!authorizedByKey(key)) {
    const owner = await requireDeploymentOwner(context);
    if (owner instanceof Response) return owner;
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
