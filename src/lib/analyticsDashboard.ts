/**
 * Admin / portal analytics dashboard — Plausible (default) or GA4.
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
import { ga4DashboardStats } from './ga4Client';
import {
  AnalyticsApiError,
  AnalyticsAuthError,
  GOOGLE_WEBMASTER_PROVIDER,
  isGoogleWebmasterOAuthConfigured,
} from './googleWebmasterAuth';
import {
  agencySubject,
  contactSubject,
  getIntegrationToken,
  type IntegrationSubject,
} from './integrationTokens';

export type AnalyticsSource = 'plausible' | 'ga4';

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
  source: AnalyticsSource;
  siteId: string;
  rangeDays: number;
  period: string;
  dashboardUrl: string | null;
  error?: string;
  failed?: boolean;
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
  googleConnected?: boolean;
  availableSources: AnalyticsSource[];
};

function emptyMetrics() {
  return {
    visitors: { value: 0, change: null },
    pageviews: { value: 0, change: null },
    bounceRate: { value: 0, change: null },
    visitDuration: { value: 0, change: null },
  };
}

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

function resolveSubject(contactUid?: string | null): IntegrationSubject {
  const uid = (contactUid ?? '').trim();
  return uid ? contactSubject(uid) : agencySubject();
}

export async function resolveAnalyticsSource(opts: {
  preferred?: string | null;
  contactUid?: string | null;
  ga4PropertyId?: string | null;
}): Promise<{ source: AnalyticsSource; available: AnalyticsSource[] }> {
  const available: AnalyticsSource[] = [];
  if (isPlausibleConfigured()) available.push('plausible');

  const subject = resolveSubject(opts.contactUid);
  const googleToken = await getIntegrationToken(subject, GOOGLE_WEBMASTER_PROVIDER);
  const agencyToken =
    subject === agencySubject()
      ? googleToken
      : await getIntegrationToken(agencySubject(), GOOGLE_WEBMASTER_PROVIDER);
  if (isGoogleWebmasterOAuthConfigured() && (googleToken || agencyToken)) {
    available.push('ga4');
  }

  const preferred = (opts.preferred || '').trim().toLowerCase();
  if (preferred === 'ga4' && available.includes('ga4')) {
    return { source: 'ga4', available };
  }
  if (preferred === 'plausible' && available.includes('plausible')) {
    return { source: 'plausible', available };
  }
  // Default: Plausible when configured, else GA4.
  if (available.includes('plausible')) return { source: 'plausible', available };
  if (available.includes('ga4')) return { source: 'ga4', available };
  return { source: 'plausible', available };
}

async function buildPlausibleDashboard(
  siteId: string,
  rangeDays: number,
  available: AnalyticsSource[],
  googleConnected: boolean,
): Promise<AnalyticsDashboard> {
  const period = plausiblePeriodForDays(rangeDays);
  const dashboardUrl = plausibleDashboardUrl(siteId);

  if (!isPlausibleConfigured()) {
    return {
      configured: false,
      source: 'plausible',
      siteId,
      rangeDays,
      period,
      dashboardUrl,
      realtimeVisitors: null,
      metrics: emptyMetrics(),
      series: [],
      topPages: [],
      topSources: [],
      googleConnected,
      availableSources: available,
    };
  }

  if (!siteId) {
    return {
      configured: true,
      source: 'plausible',
      siteId: '',
      rangeDays,
      period,
      dashboardUrl: null,
      error: 'Pass site_id or set PLAUSIBLE_SITE_ID / company domain for the admin dashboard',
      failed: true,
      realtimeVisitors: null,
      metrics: emptyMetrics(),
      series: [],
      topPages: [],
      topSources: [],
      googleConnected,
      availableSources: available,
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
      source: 'plausible',
      siteId,
      rangeDays,
      period,
      dashboardUrl,
      error: failed.error,
      failed: true,
      realtimeVisitors: realtime.ok ? Number(realtime.data.visitors) || 0 : null,
      metrics: emptyMetrics(),
      series: [],
      topPages: [],
      topSources: [],
      googleConnected,
      availableSources: available,
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
    source: 'plausible',
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
    googleConnected,
    availableSources: available,
  };
}

async function buildGa4Dashboard(args: {
  propertyId: string;
  rangeDays: number;
  subject: IntegrationSubject;
  available: AnalyticsSource[];
  googleConnected: boolean;
}): Promise<AnalyticsDashboard> {
  const period = `${args.rangeDays}d`;
  if (!args.propertyId) {
    return {
      configured: true,
      source: 'ga4',
      siteId: '',
      rangeDays: args.rangeDays,
      period,
      dashboardUrl: null,
      error: 'GA4 property id is required',
      failed: true,
      realtimeVisitors: null,
      metrics: emptyMetrics(),
      series: [],
      topPages: [],
      topSources: [],
      googleConnected: args.googleConnected,
      availableSources: args.available,
    };
  }

  try {
    const stats = await ga4DashboardStats({
      propertyId: args.propertyId,
      rangeDays: args.rangeDays,
      subject: args.subject,
    });
    return {
      configured: true,
      source: 'ga4',
      siteId: stats.propertyId,
      rangeDays: args.rangeDays,
      period,
      dashboardUrl: `https://analytics.google.com/analytics/web/#/p${stats.propertyId}/`,
      realtimeVisitors: null,
      metrics: {
        visitors: { value: stats.metrics.visitors, change: null },
        pageviews: { value: stats.metrics.pageviews, change: null },
        bounceRate: {
          value: stats.metrics.bounceRate ?? 0,
          change: null,
        },
        visitDuration: {
          value: stats.metrics.visitDuration ?? 0,
          change: null,
        },
      },
      series: stats.series,
      topPages: stats.topPages,
      topSources: stats.topSources,
      googleConnected: args.googleConnected,
      availableSources: args.available,
    };
  } catch (e) {
    const message =
      e instanceof AnalyticsAuthError || e instanceof AnalyticsApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : 'GA4 request failed';
    return {
      configured: true,
      source: 'ga4',
      siteId: args.propertyId,
      rangeDays: args.rangeDays,
      period,
      dashboardUrl: null,
      error: message,
      failed: true,
      realtimeVisitors: null,
      metrics: emptyMetrics(),
      series: [],
      topPages: [],
      topSources: [],
      googleConnected: args.googleConnected,
      availableSources: args.available,
    };
  }
}

export async function buildAnalyticsDashboard(
  companyDomain: string,
  opts: {
    rangeDays: number;
    source?: string | null;
    siteId?: string | null;
    ga4PropertyId?: string | null;
    contactUid?: string | null;
  },
): Promise<AnalyticsDashboard> {
  const { source, available } = await resolveAnalyticsSource({
    preferred: opts.source,
    contactUid: opts.contactUid,
    ga4PropertyId: opts.ga4PropertyId,
  });

  const subject = resolveSubject(opts.contactUid);
  let effectiveSubject = subject;
  const ownToken = await getIntegrationToken(subject, GOOGLE_WEBMASTER_PROVIDER);
  if (!ownToken && subject !== agencySubject()) {
    effectiveSubject = agencySubject();
  }
  const googleConnected = Boolean(
    (await getIntegrationToken(effectiveSubject, GOOGLE_WEBMASTER_PROVIDER)) ||
      (await getIntegrationToken(agencySubject(), GOOGLE_WEBMASTER_PROVIDER)),
  );

  if (source === 'ga4') {
    const agencyTok = await getIntegrationToken(agencySubject(), GOOGLE_WEBMASTER_PROVIDER);
    const fromOwn =
      ownToken?.meta?.ga4PropertyId != null ? String(ownToken.meta.ga4PropertyId) : '';
    const fromAgency =
      agencyTok?.meta?.ga4PropertyId != null ? String(agencyTok.meta.ga4PropertyId) : '';
    const propertyId = (opts.ga4PropertyId || '').trim() || fromOwn || fromAgency;

    return buildGa4Dashboard({
      propertyId,
      rangeDays: opts.rangeDays,
      subject: effectiveSubject,
      available,
      googleConnected,
    });
  }

  const siteId = (opts.siteId || '').trim() || plausibleSiteId(companyDomain);
  return buildPlausibleDashboard(siteId, opts.rangeDays, available, googleConnected);
}
