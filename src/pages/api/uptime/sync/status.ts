/**
 * GET /api/uptime/sync/status — poll background site sync progress.
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../../lib/features';
import { getUptimePlatformSyncStatus } from '../../../../lib/uptimePlatformSyncJob';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!hasFeature('uptime_monitoring')) {
    return json({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }

  return json({ ok: true, ...getUptimePlatformSyncStatus() });
};
