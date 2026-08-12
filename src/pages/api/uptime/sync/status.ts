/**
 * GET /api/uptime/sync/status — poll background site sync progress.
 */
import type { APIRoute } from 'astro';
import { json } from '../../../../lib/apiJson';
import { hasFeature } from '../../../../lib/features';
import { getUptimePlatformSyncStatus } from '../../../../lib/uptimePlatformSyncJob';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;


export const GET: APIRoute = async ({ locals }) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  if (!hasFeature('uptime_monitoring')) {
    return json({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }

  return json({ ok: true, ...getUptimePlatformSyncStatus() });
};
