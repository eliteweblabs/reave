/**
 * Shared dashboard fleet card list — Railway/Kinsta hosted apex + Plausible + uptime + persisted health.
 */
import type { APIContext } from 'astro';
import {
  buildAnalyticsDashboardPreview,
  buildHostedFleetPreviewCached,
  hydrateHostedFleetCache,
  isFleetDiscoveryConfigured,
  mergeAnalyticsFleetPreviews,
  peekCachedAnalyticsDashboardPreview,
  peekCachedHostedFleetPreview,
} from './analyticsFleet';
import {
  mergeDashboardSiteCards,
  type AnalyticsAccountRow,
  type DashboardSiteCard,
} from './analyticsSiteMerge';
import { getCompanyConfig } from './companyConfig';
import { hasFeature } from './features';
import { hydrateSiteHealthFleetCache, peekCachedSiteHealthFleet } from './siteHealthGrade';
import { loadSiteFleetIgnoreState } from './siteFleetIgnore';
import { enrichUptimeMonitorView } from './uptimerobotClient';
import { getUptimeMonitorsView, syncUptimeMonitorsFromApiIfStale } from './uptimeMonitoring';

/** Full apex fleet for dashboard tiles and scan inputs. */
export async function loadDashboardFleetCards(context: APIContext): Promise<DashboardSiteCard[]> {
  const company = await getCompanyConfig(context.request);

  if (hasFeature('uptime_monitoring')) {
    await syncUptimeMonitorsFromApiIfStale();
  }
  const monitorsView = hasFeature('uptime_monitoring')
    ? await getUptimeMonitorsView()
    : { monitors: [] as Awaited<ReturnType<typeof getUptimeMonitorsView>>['monitors'] };
  const monitors = monitorsView.monitors.map(enrichUptimeMonitorView);

  let analyticsSites: AnalyticsAccountRow[] = [];

  if (isFleetDiscoveryConfigured()) {
    let hosted = await buildHostedFleetPreviewCached(company.domain, { requireLive: true }).catch(
      () => null,
    );
    if (!hosted?.sites?.length) {
      await hydrateHostedFleetCache(company.domain);
      hosted =
        peekCachedHostedFleetPreview(company.domain, {
          allowStale: true,
          allowPersisted: true,
        }) ?? null;
    }
    const analytics = mergeAnalyticsFleetPreviews(
      peekCachedAnalyticsDashboardPreview(company.domain, { allowStale: true }),
      hosted,
    );
    if (analytics?.sites?.length) {
      analyticsSites = analytics.sites;
    } else if (hasFeature('analytic_audit')) {
      const built = await buildAnalyticsDashboardPreview(company.domain).catch(() => null);
      analyticsSites = built?.sites ?? [];
    }
  } else if (hasFeature('analytic_audit')) {
    const built = await buildAnalyticsDashboardPreview(company.domain).catch(() => null);
    analyticsSites = built?.sites ?? [];
  }

  await hydrateSiteHealthFleetCache();
  const ignore = await loadSiteFleetIgnoreState();
  const fleet = peekCachedSiteHealthFleet({ allowStale: true });

  return mergeDashboardSiteCards(monitors, analyticsSites, {
    siteHealthSites: fleet?.sites ?? null,
    ignoredSiteIds: Object.keys(ignore.sites ?? {}),
  });
}
