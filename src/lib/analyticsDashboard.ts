/**
 * Admin analytics dashboard — aggregates Plausible Stats API responses.
 */
import {
  isPlausibleConfigured,
  plausibleAggregate,
  plausibleBreakdown,
  plausibleDashboardUrl,
  plausiblePeriodForDays,
  plausibleRealtimeVisitors,
  plausibleSiteId,
  plausibleTimeseries,
} from './plausibleClient';

export type AnalyticsBreakdownRow = {
  label: string;
  visitors: number;
  pageviews: number;
};

export type AnalyticsMetric = {
  value: number;
  change: number | null;
};

export type AnalyticsDashboard = {
  configured: boolean;
  siteId: string;
  rangeDays: number;
  period: string;
  dashboardUrl: string | null;
  error?: string;
  realtimeVisitors: number | null;
  metrics: {
    visitors: AnalyticsMetric;
    pageviews: AnalyticsMetric;
    bounceRate: AnalyticsMetric;
    visitDuration: AnalyticsMetric;
  };
  series: Array<{ date: string; visitors: number; pageviews: number }>;
  topPages: AnalyticsBreakdownRow[];
  topSources: AnalyticsBreakdownRow[];
};

function metricFromResults(
  results: Record<string, { value?: number; change?: number }> | undefined,
  key: string,
): AnalyticsMetric {
  const row = results?.[key];
  const value = typeof row?.value === 'number' ? row.value : Number(row?.value) || 0;
  const change =
    typeof row?.change === 'number' ? row.change : row?.change != null ? Number(row.change) : null;
  return { value, change: Number.isFinite(change) ? change : null };
}

function parseBreakdown(
  rows: Array<Record<string, string | number | undefined>> | undefined,
  property: string,
): AnalyticsBreakdownRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const raw =
      row[property] ??
      row.page ??
      row.source ??
      row.referrer ??
      row.name ??
      '(not set)';
    return {
      label: String(raw || '(not set)'),
      visitors: Number(row.visitors) || 0,
      pageviews: Number(row.pageviews) || 0,
    };
  });
}

export async function buildAnalyticsDashboard(
  companyDomain: string,
  opts: { rangeDays: number },
): Promise<AnalyticsDashboard> {
  const siteId = plausibleSiteId(companyDomain);
  const rangeDays = opts.rangeDays;
  const period = plausiblePeriodForDays(rangeDays);
  const dashboardUrl = plausibleDashboardUrl(siteId);

  const emptyMetrics = {
    visitors: { value: 0, change: null },
    pageviews: { value: 0, change: null },
    bounceRate: { value: 0, change: null },
    visitDuration: { value: 0, change: null },
  };

  if (!isPlausibleConfigured()) {
    return {
      configured: false,
      siteId,
      rangeDays,
      period,
      dashboardUrl,
      realtimeVisitors: null,
      metrics: emptyMetrics,
      series: [],
      topPages: [],
      topSources: [],
    };
  }

  if (!siteId) {
    return {
      configured: true,
      siteId: '',
      rangeDays,
      period,
      dashboardUrl: null,
      error: 'Set PLAUSIBLE_SITE_ID or company domain for the site id',
      realtimeVisitors: null,
      metrics: emptyMetrics,
      series: [],
      topPages: [],
      topSources: [],
    };
  }

  const [aggregate, timeseries, pages, sources, realtime] = await Promise.all([
    plausibleAggregate(siteId, period, [
      'visitors',
      'pageviews',
      'bounce_rate',
      'visit_duration',
    ]),
    plausibleTimeseries(siteId, period, ['visitors', 'pageviews']),
    plausibleBreakdown(siteId, period, 'event:page', 8),
    plausibleBreakdown(siteId, period, 'visit:source', 8),
    plausibleRealtimeVisitors(siteId),
  ]);

  const failed = [aggregate, timeseries, pages, sources].find((r) => !r.ok);
  if (failed && !failed.ok) {
    return {
      configured: true,
      siteId,
      rangeDays,
      period,
      dashboardUrl,
      error: failed.error,
      realtimeVisitors: realtime.ok ? Number(realtime.data.visitors) || 0 : null,
      metrics: emptyMetrics,
      series: [],
      topPages: [],
      topSources: [],
    };
  }

  const agg = aggregate.ok ? aggregate.data.results : undefined;
  const series = timeseries.ok
    ? (timeseries.data.results ?? []).map((row) => ({
        date: String(row.date ?? ''),
        visitors: Number(row.visitors) || 0,
        pageviews: Number(row.pageviews) || 0,
      }))
    : [];

  return {
    configured: true,
    siteId,
    rangeDays,
    period,
    dashboardUrl,
    realtimeVisitors: realtime.ok ? Number(realtime.data.visitors) || 0 : null,
    metrics: {
      visitors: metricFromResults(agg, 'visitors'),
      pageviews: metricFromResults(agg, 'pageviews'),
      bounceRate: metricFromResults(agg, 'bounce_rate'),
      visitDuration: metricFromResults(agg, 'visit_duration'),
    },
    series,
    topPages: parseBreakdown(pages.ok ? pages.data.results : undefined, 'page'),
    topSources: parseBreakdown(sources.ok ? sources.data.results : undefined, 'source'),
  };
}
