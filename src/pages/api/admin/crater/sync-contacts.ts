/**
 * POST /api/admin/crater/sync-contacts — push all contacts to Crater (create or refresh).
 */
import type { APIContext } from 'astro';
import { syncAllContactsToCrater } from '../../../../lib/contactCraterSync';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { hasFeature } from '../../../../lib/features';
import { isCraterConfigured } from '../../../../lib/craterClient';
import { isContactApiConfigured } from '../../../../lib/contactApi';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!isContactApiConfigured()) {
    return jsonResponse({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }
  if (!hasFeature('billing') || !isCraterConfigured()) {
    return jsonResponse({ ok: false, error: 'Crater billing is not configured' }, 404);
  }

  const result = await syncAllContactsToCrater();
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error }, 502);
  }

  return jsonResponse({ ok: true, stats: result.stats });
}
