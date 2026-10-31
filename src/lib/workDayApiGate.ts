import type { APIContext } from 'astro';
import { hasFeature } from './features';
import { isWorkDayStoreConfigured } from './workDayStore';
import { jsonResponse } from './apiResponse';

export function workDayFeatureResponse(): Response | null {
  if (!hasFeature('work_day')) {
    return jsonResponse({ ok: false, error: 'work_day not enabled' }, 404);
  }
  if (!isWorkDayStoreConfigured()) {
    return jsonResponse({ ok: false, error: 'DATABASE_URL is required for Work Day' }, 503);
  }
  return null;
}

export async function requireWorkDayApi(
  context: APIContext,
): Promise<{ userId: string } | Response> {
  const blocked = workDayFeatureResponse();
  if (blocked) return blocked;
  const { requireDashboardUser } = await import('./dashboardAuth');
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  return { userId: auth.userId };
}
