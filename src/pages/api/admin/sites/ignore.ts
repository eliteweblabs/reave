/**
 * GET /api/admin/sites/ignore — ignored fleet sites (legal hold / do not touch).
 * PATCH — toggle ignore for one apex domain.
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';
import { hasFeature } from '../../../../lib/features';
import {
  annotateSiteHealthFleet,
  loadSiteFleetIgnoreState,
  normalizeSiteFleetIgnoreSiteId,
  setSiteFleetIgnored,
} from '../../../../lib/siteFleetIgnore';
import {
  hydrateSiteHealthFleetCache,
  peekCachedSiteHealthFleet,
} from '../../../../lib/siteHealthGrade';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!hasFeature('analytic_audit') && !hasFeature('uptime_monitoring')) {
    return jsonResponse({ ok: false, error: 'Sites module is not enabled' }, 404);
  }

  const ignore = await loadSiteFleetIgnoreState();
  await hydrateSiteHealthFleetCache();
  const fleet = peekCachedSiteHealthFleet({ allowStale: true });

  return jsonResponse({
    ok: true,
    ignore,
    siteHealth: annotateSiteHealthFleet(fleet, ignore),
  });
}

export async function PATCH(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!hasFeature('analytic_audit') && !hasFeature('uptime_monitoring')) {
    return jsonResponse({ ok: false, error: 'Sites module is not enabled' }, 404);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const siteId = normalizeSiteFleetIgnoreSiteId(String(body.siteId || body.site_id || ''));
  if (!siteId) {
    return jsonResponse({ ok: false, error: 'siteId is required' }, 400);
  }

  const ignored =
    body.ignored === true ||
    body.ignored === 'true' ||
    body.ignored === 1 ||
    body.ignored === '1';

  const reason = typeof body.reason === 'string' ? body.reason : undefined;
  const ignore = await setSiteFleetIgnored({ siteId, ignored, reason });
  if (!ignore) {
    return jsonResponse({ ok: false, error: 'Could not save ignore state' }, 500);
  }

  await hydrateSiteHealthFleetCache();
  const fleet = peekCachedSiteHealthFleet({ allowStale: true });

  return jsonResponse({
    ok: true,
    siteId,
    ignored,
    ignore,
    siteHealth: annotateSiteHealthFleet(fleet, ignore),
  });
}
