/**
 * POST /api/uptime/sync — start background Kinsta/Railway → UptimeRobot sync.
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../lib/features';
import { startUptimePlatformSyncBackground } from '../../../lib/uptimePlatformSyncJob';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ locals }) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  if (!hasFeature('uptime_monitoring')) {
    return json({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }

  const started = startUptimePlatformSyncBackground();
  if (!started) {
    return json({ ok: false, error: 'Sync already running', alreadyRunning: true }, 409);
  }

  return json({ ok: true, started: true });
};
