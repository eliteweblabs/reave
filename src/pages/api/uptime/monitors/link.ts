/**
 * POST /api/uptime/monitors/link — import a monitor created in the UptimeRobot dashboard.
 *
 * Body: { monitorId: number }
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../../lib/features';
import { linkUptimeMonitor } from '../../../../lib/uptimeMonitoring';
import { enrichUptimeMonitorView } from '../../../../lib/uptimerobotClient';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { json } from '../../../../lib/apiJson';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  if (!hasFeature('uptime_monitoring')) {
    return json({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }

  let body: { monitorId?: unknown };
  try {
    body = (await request.json()) as { monitorId?: unknown };
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const monitorId = Number(body.monitorId);
  if (!Number.isFinite(monitorId) || monitorId <= 0) {
    return json({ ok: false, error: 'monitorId must be a positive number' }, 400);
  }

  const result = await linkUptimeMonitor({ monitorId });
  if (!result.ok) return json({ ok: false, error: result.error }, 502);

  const m = result.monitor;
  return json({
    ok: true,
    monitor: enrichUptimeMonitorView(m),
  });
};
