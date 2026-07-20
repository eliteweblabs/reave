/**
 * POST /api/uptime/sync — add Kinsta + Railway URLs to UptimeRobot when missing.
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../lib/features';
import { syncPlatformUrlsToUptime } from '../../../lib/uptimeMonitoring';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ locals }) => {
  const { userId } = locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  if (!hasFeature('uptime_monitoring')) {
    return json({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }

  const result = await syncPlatformUrlsToUptime();
  if (!result.ok && result.created === 0) {
    return json({ ok: false, ...result }, 502);
  }

  return json({ ok: true, ...result });
};
