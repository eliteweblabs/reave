/**
 * GET  /api/admin/uptimerobot — UptimeRobot admin plugin status
 * POST /api/admin/uptimerobot — sync monitors from UptimeRobot API
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { hasFeature } from '../../../lib/features';
import { isUptimeRobotConfigured } from '../../../lib/uptimerobotClient';
import { isUptimeDbConfigured } from '../../../lib/pgUptime';
import { syncUptimeMonitorsFromApi } from '../../../lib/uptimeMonitoring';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  return jsonResponse({
    ok: true,
    featureEnabled: hasFeature('uptime_monitoring'),
    configured: isUptimeRobotConfigured(),
    dbConfigured: isUptimeDbConfigured(),
    note:
      'UptimeRobot sync pulls monitor status from the UptimeRobot API and updates the local database. Requires UPTIMEROBOT_API_KEY and DATABASE_URL.',
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!hasFeature('uptime_monitoring')) {
    return jsonResponse(
      { ok: false, error: 'Enable "uptime_monitoring" in the install config features array.' },
      403,
    );
  }

  const result = await syncUptimeMonitorsFromApi();

  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error }, 502);
  }

  return jsonResponse({
    ok: true,
    synced: result.synced,
  });
}
