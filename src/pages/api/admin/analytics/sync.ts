/**
 * POST /api/admin/analytics/sync — register live Railway custom domains in Plausible.
 */
import type { APIContext } from 'astro';
import { syncPlausibleSitesFromRailway } from '../../../../lib/analyticsFleet';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  try {
    const result = await syncPlausibleSitesFromRailway();
    const ok = result.ok || result.created > 0 || result.skipped > 0;
    return jsonResponse({ ...result, ok });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Analytics sync failed';
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
