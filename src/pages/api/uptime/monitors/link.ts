/**
 * POST /api/uptime/monitors/link — import a monitor created in the UptimeRobot dashboard.
 *
 * Body: { monitorId: number }
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../../lib/features';
import { linkUptimeMonitor } from '../../../../lib/uptimeMonitoring';
import { uptimeStatusLabel } from '../../../../lib/uptimerobotClient';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const { userId } = locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

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
    monitor: {
      ...m,
      status_label: uptimeStatusLabel(m.status),
      is_down: m.status === 8 || m.status === 9,
    },
  });
};
