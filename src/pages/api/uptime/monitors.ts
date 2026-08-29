/**
 * GET /api/uptime/monitors — list monitors + current status from DB.
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../lib/features';
import { createUptimeMonitor, getUptimeMonitorsView } from '../../../lib/uptimeMonitoring';
import { ensureUptimePollScheduler } from '../../../lib/uptimePollScheduler';
import { enrichUptimeMonitorView } from '../../../lib/uptimerobotClient';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export const GET: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!hasFeature('uptime_monitoring')) {
    return jsonResponse({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }

  ensureUptimePollScheduler();
  const view = await getUptimeMonitorsView();

  return jsonResponse({
    ok: true,
    configured: view.configured,
    monitors: view.monitors.map(enrichUptimeMonitorView),
  });
};

export const POST: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!hasFeature('uptime_monitoring')) {
    return jsonResponse({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }

  let body: { url?: string; friendlyName?: string };
  try {
    body = (await context.request.json()) as { url?: string; friendlyName?: string };
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const url = body.url?.trim();
  if (!url) return jsonResponse({ ok: false, error: 'url is required' }, 400);

  const result = await createUptimeMonitor({
    url,
    friendlyName: body.friendlyName?.trim() || undefined,
  });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 502);

  const m = result.monitor;
  return jsonResponse({
    ok: true,
    monitor: enrichUptimeMonitorView(m),
  });
};
