/**
 * Multi-site Plausible fleet — dashboard preview + Analytics accounts page.
 */
import {
  type AnalyticsAccountRow,
  type AnalyticsFleetPreview,
  summarizeAnalyticsAccounts,
} from './analyticsSiteMerge';
import {
  listAnalyticsSites,
  listRailwayAnalyticsSites,
  type AnalyticsSiteOption,
} from './analyticsSites';
import {
  isPlausibleConfigured,
  isPlausibleSiteMissingError,
  plausibleAggregate,
  plausibleCreateSite,
  plausibleDashboardUrl,
  plausiblePeriodForDays,
  plausibleRealtimeVisitors,
  plausibleSitesNewUrl,
} from './plausibleClient';
import { isRailwayConfigured } from './railwayClient';

export type { AnalyticsAccountRow, AnalyticsFleetPreview } from './analyticsSiteMerge';
export { summarizeAnalyticsAccounts } from './analyticsSiteMerge';

export type AnalyticsSyncItem = {
  siteId: string;
  label: string;
  sourceLabel?: string;
};

export type AnalyticsSyncResult = {
  ok: boolean;
  discovered: number;
  created: number;
  skipped: number;
  failed: number;
  sitesApiAvailable: boolean | null;
  createdItems: AnalyticsSyncItem[];
  skippedItems: Array<AnalyticsSyncItem & { reason: string }>;
  manualItems: Array<AnalyticsSyncItem & { addUrl: string }>;
  errors: string[];
  warnings: string[];
};

function emptyMetrics(): Pick<
  AnalyticsAccountRow,
  'registered' | 'visitors' | 'pageviews' | 'realtimeVisitors' | 'change' | 'dashboardUrl'
> {
  return {
    registered: false,
    visitors: null,
    pageviews: null,
    realtimeVisitors: null,
    change: null,
    dashboardUrl: null,
  };
}

function metricValue(
  results: Record<string, { value?: number; change?: number }> | undefined,
  key: string,
): { value: number; change: number | null } {
  const row = results?.[key];
  const value = typeof row?.value === 'number' ? row.value : Number(row?.value) || 0;
  const change =
    typeof row?.change === 'number' ? row.change : row?.change != null ? Number(row.change) : null;
  return { value, change: Number.isFinite(change) ? change : null };
}

export async function loadAnalyticsAccountRow(
  site: AnalyticsSiteOption,
  rangeDays: number,
): Promise<AnalyticsAccountRow> {
  const dashboardUrl = plausibleDashboardUrl(site.siteId);
  const base: AnalyticsAccountRow = {
    ...site,
    ...emptyMetrics(),
    dashboardUrl,
  };
  if (!isPlausibleConfigured()) return base;

  const period = plausiblePeriodForDays(rangeDays);
  const [aggregate, realtime] = await Promise.all([
    plausibleAggregate(site.siteId, period, ['visitors', 'pageviews'], true),
    plausibleRealtimeVisitors(site.siteId),
  ]);

  if (!aggregate.ok) {
    return {
      ...base,
      registered: !isPlausibleSiteMissingError(aggregate.error),
      error: aggregate.error,
    };
  }

  const visitors = metricValue(aggregate.data.results, 'visitors');
  const pageviews = metricValue(aggregate.data.results, 'pageviews');
  return {
    ...base,
    registered: true,
    visitors: visitors.value,
    pageviews: pageviews.value,
    change: visitors.change,
    realtimeVisitors: realtime.ok ? Number(realtime.data.visitors) || 0 : null,
  };
}

export async function listAnalyticsAccounts(
  companyDomain: string,
  opts: { rangeDays?: number; includeRailway?: boolean; freshRailway?: boolean } = {},
): Promise<{
  configured: boolean;
  rangeDays: number;
  railwayConfigured: boolean;
  accounts: AnalyticsAccountRow[];
  warnings: string[];
}> {
  const rangeDays = opts.rangeDays === 7 || opts.rangeDays === 90 ? opts.rangeDays : 30;
  const includeRailway = opts.includeRailway !== false;
  const sites = await listAnalyticsSites(companyDomain, {
    includeRailway,
    freshRailway: opts.freshRailway,
  });

  const accounts = await Promise.all(sites.map((site) => loadAnalyticsAccountRow(site, rangeDays)));
  return {
    configured: isPlausibleConfigured(),
    rangeDays,
    railwayConfigured: isRailwayConfigured(),
    accounts,
    warnings: [],
  };
}

export async function buildAnalyticsDashboardPreview(
  companyDomain: string,
): Promise<AnalyticsFleetPreview> {
  if (!isPlausibleConfigured()) {
    return summarizeAnalyticsAccounts([], 30, { configured: false });
  }
  const { accounts } = await listAnalyticsAccounts(companyDomain, {
    rangeDays: 30,
    includeRailway: true,
  });
  return summarizeAnalyticsAccounts(accounts, 30, { configured: true });
}

export async function syncPlausibleSitesFromRailway(): Promise<AnalyticsSyncResult> {
  const empty: AnalyticsSyncResult = {
    ok: false,
    discovered: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    sitesApiAvailable: null,
    createdItems: [],
    skippedItems: [],
    manualItems: [],
    errors: [],
    warnings: [],
  };

  if (!isPlausibleConfigured()) {
    return { ...empty, errors: ['Plausible is not configured (PLAUSIBLE_API_BASE_URL / PLAUSIBLE_API_KEY)'] };
  }
  if (!isRailwayConfigured()) {
    return { ...empty, errors: ['RAILWAY_API_TOKEN is not set'] };
  }

  const railway = await listRailwayAnalyticsSites({ fresh: true });
  const addUrl = plausibleSitesNewUrl() || '';
  const result: AnalyticsSyncResult = {
    ...empty,
    ok: true,
    discovered: railway.sites.length,
    warnings: [...railway.warnings],
  };

  for (const site of railway.sites) {
    const item: AnalyticsSyncItem = {
      siteId: site.siteId,
      label: site.label,
      sourceLabel: site.sourceLabel,
    };
    const created = await plausibleCreateSite(site.siteId);
    if (created.ok) {
      result.sitesApiAvailable = true;
      if (created.alreadyExisted) {
        result.skipped += 1;
        result.skippedItems.push({ ...item, reason: 'already registered' });
      } else {
        result.created += 1;
        result.createdItems.push(item);
      }
      continue;
    }

    result.sitesApiAvailable = created.sitesApi;
    if (created.alreadyExisted) {
      result.skipped += 1;
      result.skippedItems.push({ ...item, reason: 'already registered' });
      continue;
    }

    const registered = await plausibleAggregate(site.siteId, '30d', ['visitors'], false);
    if (registered.ok) {
      result.skipped += 1;
      result.skippedItems.push({ ...item, reason: 'already registered' });
      continue;
    }

    if (!created.sitesApi) {
      result.failed += 1;
      result.manualItems.push({ ...item, addUrl });
      continue;
    }

    result.failed += 1;
    result.errors.push(`${site.siteId}: ${created.error}`);
    result.manualItems.push({ ...item, addUrl });
  }

  if (result.manualItems.length && result.sitesApiAvailable === false) {
    result.warnings.push(
      'Self-hosted Plausible CE cannot create sites through the API. Add each missing domain in Plausible, then reload Analytics.',
    );
  }

  result.ok = result.errors.length === 0 || result.created > 0 || result.skipped > 0;
  return result;
}
