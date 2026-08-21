/**
 * GET /api/admin/sales-sheet — build the audit sales-sheet preview HTML.
 * Same query params as `/admin/sales-sheet`. Owner-only; slow on purpose
 * (Places + optional Playwright), so the page paints a skeleton first.
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { buildSalesSheetView } from '../../../lib/salesSheetPage';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  try {
    const view = await buildSalesSheetView({
      params: context.url.searchParams,
      origin: context.url.origin,
      request: context.request,
    });
    return json({ ok: true, ...view });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error }, 500);
  }
}
