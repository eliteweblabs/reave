/**
 * GET /api/uptime/monitors — list monitors + current status from DB.
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../lib/features';
import { createUptimeMonitor, getUptimeMonitorsView } from '../../../lib/uptimeMonitoring';
import { ensureUptimePollScheduler } from '../../../lib/uptimePollScheduler';
import { uptimeStatusLabel } from '../../../lib/uptimerobotClient';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ locals }) => {
  const { userId } = locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  if (!hasFeature('uptime_monitoring')) {
    return json({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }

  ensureUptimePollScheduler();
  const view = await getUptimeMonitorsView();

  return json({
    ok: true,
    configured: view.configured,
    monitors: view.monitors.map((m) => ({
      ...m,
      status_label: uptimeStatusLabel(m.status),
      is_down: m.status === 8 || m.status === 9,
    })),
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const { userId } = locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

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
    monitor: {
      ...m,
      status_label: uptimeStatusLabel(m.status),
      is_down: m.status === 8 || m.status === 9,
    },
  });
};
