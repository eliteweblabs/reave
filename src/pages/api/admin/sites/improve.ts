/**
 * POST /api/admin/sites/improve — scan, auto-wire Plausible/GSC/sitemaps, PageSpeed, re-scan.
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
import { improveFleetScores } from '../../../../lib/fleetScoreFix';
import { annotateSiteHealthFleet, loadSiteFleetIgnoreState } from '../../../../lib/siteFleetIgnore';
import type { SiteHealthCardInput } from '../../../../lib/siteHealthGrade';

export const prerender = false;

async function loadCardInputs(context: APIContext): Promise<SiteHealthCardInput[]> {
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
  return mergeDashboardSiteCards(monitors, analytics?.sites ?? []).map((card) => ({
    siteId: card.siteId,
    website: card.analytics?.website ?? null,
    monitor: card.monitor,
    analytics: card.analytics,
  }));
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!hasFeature('analytic_audit') && !hasFeature('uptime_monitoring')) {
    return jsonResponse({ ok: false, error: 'Sites module is not enabled' }, 404);
  }

  const url = new URL(context.request.url);
  const includePageSpeed = url.searchParams.get('page_speed') !== '0';
  const pageSpeedFresh = url.searchParams.get('page_speed_fresh') === '1';

  const company = await getCompanyConfig(context.request);
  const ignore = await loadSiteFleetIgnoreState();
  const cardInputs = await loadCardInputs(context);

  const { siteHealth, wireResult, report } = await improveFleetScores({
    cards: cardInputs,
    ignore,
    companyDomain: company.domain,
    includePageSpeed,
    pageSpeedFresh,
    reloadCards: () => loadCardInputs(context),
  });

  return jsonResponse({
    ok: true,
    siteHealth: annotateSiteHealthFleet(siteHealth, ignore),
    siteFleetIgnore: ignore,
    refreshed: true,
    wired: wireResult.wired,
    wireErrors: wireResult.errors.length ? wireResult.errors : undefined,
    scoreReport: report,
  });
}
