/**
 * GET /api/uptime/sync/status — poll background site sync progress.
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../../lib/features';
import { getUptimePlatformSyncStatus } from '../../../../lib/uptimePlatformSyncJob';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


export const GET: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!hasFeature('uptime_monitoring')) {
    return jsonResponse({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }

  return jsonResponse({ ok: true, ...getUptimePlatformSyncStatus() });
};
