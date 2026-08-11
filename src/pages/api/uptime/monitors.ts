/**
 * GET /api/uptime/monitors — list monitors + current status from DB.
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../lib/features';
import { createUptimeMonitor, getUptimeMonitorsView } from '../../../lib/uptimeMonitoring';
import { ensureUptimePollScheduler } from '../../../lib/uptimePollScheduler';
import { enrichUptimeMonitorView } from '../../../lib/uptimerobotClient';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { json } from '../../../lib/apiJson';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  if (!hasFeature('uptime_monitoring')) {
    return json({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }

  ensureUptimePollScheduler();
  const view = await getUptimeMonitorsView();

  return json({
    ok: true,
    configured: view.configured,
    monitors: view.monitors.map(enrichUptimeMonitorView),
  });
};

export const POST: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  if (!hasFeature('uptime_monitoring')) {
    return json({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }

  let body: { url?: string; friendlyName?: string };
  try {
    body = (await request.json()) as { url?: string; friendlyName?: string };
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const url = body.url?.trim();
  if (!url) return json({ ok: false, error: 'url is required' }, 400);

  const result = await createUptimeMonitor({
    url,
    friendlyName: body.friendlyName?.trim() || undefined,
  });
  if (!result.ok) return json({ ok: false, error: result.error }, 502);

  const m = result.monitor;
  return json({
    ok: true,
    monitor: enrichUptimeMonitorView(m),
  });
};
