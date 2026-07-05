/**
 * GET /api/uptime/monitors/:id/incidents — incident history for a monitor.
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../../../lib/features';
import { dbGetUptimeMonitor } from '../../../../../lib/pgUptime';
import { getUptimeIncidentsView } from '../../../../../lib/uptimeMonitoring';
import { uptimeStatusLabel } from '../../../../../lib/uptimerobotClient';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ params, locals }) => {
  const { userId } = locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  if (!hasFeature('uptime_monitoring')) {
    return json({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }

  const monitorId = Number(params.id);
  if (!Number.isFinite(monitorId) || monitorId <= 0) {
    return json({ ok: false, error: 'Invalid monitor id' }, 400);
  }

  const monitor = await dbGetUptimeMonitor(monitorId);
  if (!monitor) return json({ ok: false, error: 'Monitor not found' }, 404);

  const incidents = await getUptimeIncidentsView(monitorId, 100);

  return json({
    ok: true,
    monitor: {
      ...monitor,
      status_label: uptimeStatusLabel(monitor.status),
    },
    incidents,
  });
};
