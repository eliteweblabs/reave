/**
 * POST /api/admin/sites/wire — register Plausible + add GSC properties for unwired fleet sites.
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';
import { hasFeature } from '../../../../lib/features';
import { getUptimeMonitorsView, syncUptimeMonitorsFromApiIfStale } from '../../../../lib/uptimeMonitoring';
import { enrichUptimeMonitorView } from '../../../../lib/uptimerobotClient';
import {
  buildAnalyticsDashboardPreview,
  peekCachedAnalyticsDashboardPreview,
} from '../../../../lib/analyticsFleet';
import { mergeDashboardSiteCards } from '../../../../lib/analyticsSiteMerge';
import { getCompanyConfig } from '../../../../lib/companyConfig';
import {
  buildSiteHealthFleet,
  invalidateSiteHealthFleetCache,
  peekCachedSiteHealthFleet,
} from '../../../../lib/siteHealthGrade';
import { wireFleetSites } from '../../../../lib/siteWiring';

export const prerender = false;

async function loadFleetCards(context: APIContext) {
  const company = await getCompanyConfig(context.request);
  if (hasFeature('uptime_monitoring')) {
    await syncUptimeMonitorsFromApiIfStale();
  }
  const monitorsView = hasFeature('uptime_monitoring')
    ? await getUptimeMonitorsView()
    : { monitors: [] as Awaited<ReturnType<typeof getUptimeMonitorsView>>['monitors'] };
  const monitors = monitorsView.monitors.map(enrichUptimeMonitorView);
  let analytics = peekCachedAnalyticsDashboardPreview(company.domain, { allowStale: true });
  if (!analytics && hasFeature('analytic_audit')) {
    analytics = await buildAnalyticsDashboardPreview(company.domain).catch(() => null);
  }
  return mergeDashboardSiteCards(monitors, analytics?.sites ?? []);
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!hasFeature('analytic_audit') && !hasFeature('uptime_monitoring')) {
    return jsonResponse({ ok: false, error: 'Sites module is not enabled' }, 404);
  }

  const cards = await loadFleetCards(context);
  const cardInputs = cards.map((card) => ({
    siteId: card.siteId,
    website: card.analytics?.website ?? null,
    monitor: card.monitor,
    analytics: card.analytics,
  }));

  let siteHealth = peekCachedSiteHealthFleet({ allowStale: true });
  if (!siteHealth) {
    siteHealth = await buildSiteHealthFleet(cardInputs).catch(() => null);
  }

  const result = await wireFleetSites(cardInputs, siteHealth);
  if (result.wired > 0) {
    invalidateSiteHealthFleetCache();
    void buildSiteHealthFleet(cardInputs, { fresh: true }).catch(() => undefined);
  }

  return jsonResponse(result);
}
