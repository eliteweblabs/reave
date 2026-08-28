/**
 * POST /api/admin/analytics/sync — register live Railway custom domains in Plausible.
 */
import type { APIContext } from 'astro';
import { syncPlausibleSitesFromRailway } from '../../../../lib/analyticsFleet';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  try {
    const result = await syncPlausibleSitesFromRailway();
    const ok = result.ok || result.created > 0 || result.skipped > 0;
    return json({ ...result, ok });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Analytics sync failed';
    return json({ ok: false, error: message }, 500);
  }
}
