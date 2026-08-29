/**
 * GET /api/uptime/monitors/:id/incidents — incident history for a monitor.
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../../../lib/features';
import { dbGetUptimeMonitor } from '../../../../../lib/pgUptime';
import { getUptimeIncidentsView } from '../../../../../lib/uptimeMonitoring';
import { uptimeStatusLabel } from '../../../../../lib/uptimerobotClient';
import { requireDashboardUser } from '../../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../../lib/apiResponse';

export const prerender = false;


export const GET: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!hasFeature('uptime_monitoring')) {
    return jsonResponse({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }

  const monitorId = Number(context.params.id);
  if (!Number.isFinite(monitorId) || monitorId <= 0) {
    return jsonResponse({ ok: false, error: 'Invalid monitor id' }, 400);
  }

  const monitor = await dbGetUptimeMonitor(monitorId);
  if (!monitor) return jsonResponse({ ok: false, error: 'Monitor not found' }, 404);

  const incidents = await getUptimeIncidentsView(monitorId, 100);

  return jsonResponse({
    ok: true,
    monitor: {
      ...monitor,
      status_label: uptimeStatusLabel(monitor.status),
    },
    incidents,
  });
};
