/**
 * GET /api/work-day/summary?week=YYYY-MM-DD — weekly aggregates (Monday week start)
 */
import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../lib/apiResponse';
import { requireWorkDayApi } from '../../../lib/workDayApiGate';
import { mondayOfWeekContaining, storeWorkDayWeekSummary } from '../../../lib/workDayStore';
import { storeReadWork } from '../../../lib/workStore';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireWorkDayApi(context);
  if (auth instanceof Response) return auth;

  const url = new URL(context.request.url);
  const weekParam = url.searchParams.get('week')?.trim();
  const weekStart = weekParam || mondayOfWeekContaining();

  const summary = await storeWorkDayWeekSummary(weekStart);

  const lines = await Promise.all(
    summary.lines.map(async (line) => {
      const job = await storeReadWork(line.jobSlug);
      return {
        ...line,
        projectTitle: job?.title || line.jobSlug,
        contactUid: job?.contact_uid || '',
        contactName: job?.contact_name || job?.client || '',
        siteAddress: job?.site_address || '',
        siteLabel: job?.site_label || '',
      };
    }),
  );

  return jsonResponse({
    ok: true,
    weekStart,
    approved: summary.approved,
    approvedAt: summary.approvedAt,
    lines,
  });
};
