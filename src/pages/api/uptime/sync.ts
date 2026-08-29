/**
 * POST /api/uptime/sync — start background Kinsta/Railway → UptimeRobot sync.
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../lib/features';
import { startUptimePlatformSyncBackground } from '../../../lib/uptimePlatformSyncJob';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export const POST: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!hasFeature('uptime_monitoring')) {
    return jsonResponse({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }

  const started = startUptimePlatformSyncBackground();
  if (!started) {
    return jsonResponse({ ok: false, error: 'Sync already running', alreadyRunning: true }, 409);
  }

  return jsonResponse({ ok: true, started: true });
};
