/**
 * GET /api/uptime/summary — dashboard aggregate (uptime %, open incidents).
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../lib/features';
import { getUptimeSummaryView } from '../../../lib/uptimeMonitoring';
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
  const view = await getUptimeSummaryView();

  return json({
    ok: true,
    configured: view.configured,
    db: view.db,
    summary: view.summary
      ? {
          ...view.summary,
          recent_incidents: view.summary.recent_incidents.map((i) => ({
            ...i,
            status_before_label:
              i.status_before != null ? uptimeStatusLabel(i.status_before) : null,
            status_after_label: i.status_after != null ? uptimeStatusLabel(i.status_after) : null,
          })),
        }
      : null,
  });
};
