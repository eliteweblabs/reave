/**
 * GET /api/admin/sites/indexing?site_id=… — live indexing status for one apex site.
 * PATCH — block or allow search engines (WordPress Connect).
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';
import { hasFeature } from '../../../../lib/features';
import {
  hydrateSiteHealthFleetCache,
  peekCachedSiteHealthFleet,
} from '../../../../lib/siteHealthGrade';
import { savePersistedSiteHealthFleet } from '../../../../lib/siteHealthStore';
import { annotateSiteHealthFleet, loadSiteFleetIgnoreState } from '../../../../lib/siteFleetIgnore';
import {
  loadSiteSearchIndexingStatus,
  normalizeSiteSearchIndexingSiteId,
  setSiteSearchIndexingBlocked,
} from '../../../../lib/siteSearchIndexing';
import type { SiteHealthSummary } from '../../../../lib/siteHealthScore';

export const prerender = false;

function patchHealthRow(siteId: string, patch: Partial<SiteHealthSummary>): void {
  const cached = peekCachedSiteHealthFleet({ allowStale: true });
  const row = cached?.sites?.[siteId];
  if (!cached || !row) return;
  cached.sites[siteId] = { ...row, ...patch };
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!hasFeature('analytic_audit') && !hasFeature('uptime_monitoring')) {
    return jsonResponse({ ok: false, error: 'Sites module is not enabled' }, 404);
  }

  const siteId = normalizeSiteSearchIndexingSiteId(
    context.url.searchParams.get('site_id') || context.url.searchParams.get('siteId') || '',
  );
  if (!siteId) {
    return jsonResponse({ ok: false, error: 'site_id is required' }, 400);
  }

  const status = await loadSiteSearchIndexingStatus(siteId);
  return jsonResponse({ ok: true, siteId, ...status });
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

  const siteId = normalizeSiteSearchIndexingSiteId(String(body.siteId || body.site_id || ''));
  if (!siteId) {
    return jsonResponse({ ok: false, error: 'siteId is required' }, 400);
  }

  const blocked =
    body.blocked === true ||
    body.blocked === 'true' ||
    body.blocked === 1 ||
    body.blocked === '1';

  const result = await setSiteSearchIndexingBlocked(siteId, blocked);
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error || 'Could not update indexing' }, 400);
  }

  await hydrateSiteHealthFleetCache();
  if (result.status?.blocked != null) {
    patchHealthRow(siteId, {
      searchEnginesBlocked: result.status.blocked,
      wpConnectAvailable: result.status.connectAvailable,
    });
    const fleet = peekCachedSiteHealthFleet({ allowStale: true });
    if (fleet) await savePersistedSiteHealthFleet(fleet);
  }

  const ignore = await loadSiteFleetIgnoreState();
  const fleet = peekCachedSiteHealthFleet({ allowStale: true });

  return jsonResponse({
    ok: true,
    siteId,
    blocked,
    status: result.status,
    siteHealth: annotateSiteHealthFleet(fleet, ignore),
  });
}
