/**
 * GET /api/uptime/sync/preview — list Kinsta/Railway URLs discovery would sync (no UptimeRobot writes).
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../../lib/features';
import { isKinstaConfigured, kinstaCollectMonitorUrls } from '../../../../lib/kinstaClient';
import { isRailwayConfigured, railwayCollectMonitorUrls } from '../../../../lib/railwayClient';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { json } from '../../../../lib/apiJson';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  if (!hasFeature('uptime_monitoring')) {
    return json({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }

  const kinsta = isKinstaConfigured() ? await kinstaCollectMonitorUrls() : null;
  const railway = isRailwayConfigured() ? await railwayCollectMonitorUrls() : null;

  const kinstaCount = kinsta?.ok ? kinsta.urls.length : 0;
  const railwayCount = railway?.ok ? railway.urls.length : 0;

  return json({
    ok: true,
    kinstaConfigured: isKinstaConfigured(),
    railwayConfigured: isRailwayConfigured(),
    kinsta,
    railway,
    total: kinstaCount + railwayCount,
  });
};
