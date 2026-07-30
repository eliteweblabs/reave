/**
 * GET /api/admin/analytics — Plausible web analytics for the admin dashboard.
 *
 * Query params:
 *   range=7|30|90  reporting window in days (default 30)
 */
import type { APIContext } from 'astro';
import { buildAnalyticsDashboard } from '../../../lib/analyticsDashboard';
import { getCompanyConfig } from '../../../lib/companyConfig';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function parseRange(raw: string | null): number {
  const n = Number(raw);
  if (n === 7 || n === 30 || n === 90) return n;
  return 30;
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  try {
    const url = new URL(context.request.url);
    const rangeDays = parseRange(url.searchParams.get('range'));
    const company = await getCompanyConfig(context.request);
    const dashboard = await buildAnalyticsDashboard(company.domain, { rangeDays });
    return json({ ok: true, dashboard });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load analytics';
    return json({ ok: false, error: message }, 500);
  }
}
