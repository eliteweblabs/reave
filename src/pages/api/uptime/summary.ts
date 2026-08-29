/**
 * GET /api/uptime/summary — dashboard aggregate (uptime %, open incidents).
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../lib/features';
import { getUptimeSummaryView } from '../../../lib/uptimeMonitoring';
import { ensureUptimePollScheduler } from '../../../lib/uptimePollScheduler';
import { uptimeStatusLabel } from '../../../lib/uptimerobotClient';
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
  const view = await getUptimeSummaryView();

  return jsonResponse({
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
