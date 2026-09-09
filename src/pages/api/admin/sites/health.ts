/**
 * GET /api/admin/sites/health — cached Sites fleet grades (robots / GSC / wiring).
 * POST — force a refresh (still returns via cache when done).
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
  hydrateSiteHealthFleetCache,
  peekCachedSiteHealthFleet,
} from '../../../../lib/siteHealthGrade';
import { improveFleetScores } from '../../../../lib/fleetScoreFix';
import { annotateSiteHealthFleet, loadSiteFleetIgnoreState } from '../../../../lib/siteFleetIgnore';
import type { SiteHealthCardInput } from '../../../../lib/siteHealthGrade';

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
  await hydrateSiteHealthFleetCache();
  const ignore = await loadSiteFleetIgnoreState();
  const fleet = peekCachedSiteHealthFleet({ allowStale: true });
  return mergeDashboardSiteCards(monitors, analytics?.sites ?? [], {
    siteHealthSites: fleet?.sites ?? null,
    ignoredSiteIds: Object.keys(ignore.sites ?? {}),
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!hasFeature('analytic_audit') && !hasFeature('uptime_monitoring')) {
    return jsonResponse({ ok: false, error: 'Sites module is not enabled' }, 404);
  }

  await hydrateSiteHealthFleetCache();
  const ignore = await loadSiteFleetIgnoreState();
  const cached = peekCachedSiteHealthFleet({ allowStale: true });
  if (cached) {
    const fresh = peekCachedSiteHealthFleet();
    const siteHealth = annotateSiteHealthFleet(cached, ignore);
    return jsonResponse({ ok: true, siteHealth, siteFleetIgnore: ignore, stale: !fresh });
  }

  return jsonResponse({ ok: true, siteHealth: null, siteFleetIgnore: ignore });
}

async function loadCardInputs(context: APIContext): Promise<SiteHealthCardInput[]> {
  const cards = await loadFleetCards(context);
  return cards.map((card) => ({
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
  const fix = url.searchParams.get('fix') !== '0';
  const includePageSpeed = url.searchParams.get('page_speed') !== '0';
  const pageSpeedFresh = url.searchParams.get('page_speed_fresh') === '1';

  const company = await getCompanyConfig(context.request);
  const ignore = await loadSiteFleetIgnoreState();
  const cardInputs = await loadCardInputs(context);

  if (fix) {
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

  const siteHealth = await buildSiteHealthFleet(cardInputs, { fresh: true });
  return jsonResponse({
    ok: true,
    siteHealth: annotateSiteHealthFleet(siteHealth, ignore),
    siteFleetIgnore: ignore,
    refreshed: true,
  });
}
