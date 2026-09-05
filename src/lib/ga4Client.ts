/**
 * Google Analytics Data API (GA4) + Admin account summaries.
 */
import {
  AnalyticsApiError,
  AnalyticsAuthError,
  getGoogleWebmasterAccessToken,
} from './googleWebmasterAuth';
import type { IntegrationSubject } from './integrationTokens';
import { agencySubject } from './integrationTokens';

async function gaFetch<T>(
  url: string,
  opts: {
    method?: string;
    body?: unknown;
    subject?: IntegrationSubject;
  } = {},
): Promise<T> {
  const subject = opts.subject ?? agencySubject();
  let accessToken: string;
  try {
    accessToken = await getGoogleWebmasterAccessToken(subject);
  } catch (e) {
    if (e instanceof AnalyticsAuthError) throw e;
    throw new AnalyticsAuthError(e instanceof Error ? e.message : String(e));
  }

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(opts.body != null ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new AnalyticsAuthError(`GA4 auth failed (${res.status}): ${text.slice(0, 240)}`);
  }
  if (res.status === 429) {
    throw new AnalyticsApiError(`GA4 quota exceeded (429). ${text.slice(0, 200)}`, 429);
  }
  if (!res.ok) {
    throw new AnalyticsApiError(`GA4 ${res.status}: ${text.slice(0, 400)}`, res.status);
  }
  if (!text.trim()) return {} as T;
  return JSON.parse(text) as T;
}

export type Ga4PropertySummary = {
  property: string;
  displayName: string;
  propertyType?: string;
};

export async function ga4ListProperties(
  subject: IntegrationSubject = agencySubject(),
): Promise<Ga4PropertySummary[]> {
  const data = await gaFetch<{
    accountSummaries?: Array<{
      displayName?: string;
      propertySummaries?: Array<{
        property?: string;
        displayName?: string;
        propertyType?: string;
      }>;
    }>;
  }>('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', { subject });

  const out: Ga4PropertySummary[] = [];
  for (const account of data.accountSummaries ?? []) {
    for (const p of account.propertySummaries ?? []) {
      if (!p.property) continue;
      out.push({
        property: p.property,
        displayName: p.displayName || p.property,
        propertyType: p.propertyType,
      });
    }
  }
  return out;
}

function normalizePropertyId(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('properties/')) return t.slice('properties/'.length);
  return t;
}

export type Ga4ReportRow = {
  dimensionValues: string[];
  metricValues: number[];
};

export async function ga4RunReport(args: {
  propertyId: string;
  startDate: string;
  endDate: string;
  metrics: string[];
  dimensions?: string[];
  limit?: number;
  subject?: IntegrationSubject;
}): Promise<{
  dimensionHeaders: string[];
  metricHeaders: string[];
  rows: Ga4ReportRow[];
  rowCount: number;
}> {
  const propertyId = normalizePropertyId(args.propertyId);
  const subject = args.subject ?? agencySubject();
  const body: Record<string, unknown> = {
    dateRanges: [{ startDate: args.startDate, endDate: args.endDate }],
    metrics: args.metrics.map((name) => ({ name })),
    limit: Math.min(Math.max(args.limit ?? 25, 1), 10000),
  };
  if (args.dimensions?.length) {
    body.dimensions = args.dimensions.map((name) => ({ name }));
  }

  const data = await gaFetch<{
    dimensionHeaders?: Array<{ name?: string }>;
    metricHeaders?: Array<{ name?: string }>;
    rows?: Array<{
      dimensionValues?: Array<{ value?: string }>;
      metricValues?: Array<{ value?: string }>;
    }>;
    rowCount?: number;
  }>(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    body,
    subject,
  });

  return {
    dimensionHeaders: (data.dimensionHeaders ?? []).map((h) => h.name || ''),
    metricHeaders: (data.metricHeaders ?? []).map((h) => h.name || ''),
    rows: (data.rows ?? []).map((row) => ({
      dimensionValues: (row.dimensionValues ?? []).map((d) => d.value || ''),
      metricValues: (row.metricValues ?? []).map((m) => Number(m.value) || 0),
    })),
    rowCount: data.rowCount ?? 0,
  };
}

/** Dashboard-shaped GA4 pull matching Plausible metric vocabulary where possible. */
export async function ga4DashboardStats(args: {
  propertyId: string;
  rangeDays: number;
  subject?: IntegrationSubject;
}): Promise<{
  propertyId: string;
  rangeDays: number;
  metrics: {
    visitors: number;
    pageviews: number;
    bounceRate: number | null;
    visitDuration: number | null;
  };
  series: Array<{ date: string; visitors: number; pageviews: number }>;
  topPages: Array<{ label: string; visitors: number; pageviews: number }>;
  topSources: Array<{ label: string; visitors: number; pageviews: number }>;
  topCountries: Array<{ label: string; visitors: number; pageviews: number }>;
  topDevices: Array<{ label: string; visitors: number; pageviews: number }>;
  topBrowsers: Array<{ label: string; visitors: number; pageviews: number }>;
}> {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(end.getUTCDate() - (args.rangeDays - 1));
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const subject = args.subject ?? agencySubject();
  const propertyId = normalizePropertyId(args.propertyId);

  const [totals, series, pages, sources, countries, devices, browsers] = await Promise.all([
    ga4RunReport({
      propertyId,
      startDate,
      endDate,
      metrics: ['activeUsers', 'screenPageViews', 'bounceRate', 'averageSessionDuration'],
      subject,
    }),
    ga4RunReport({
      propertyId,
      startDate,
      endDate,
      metrics: ['activeUsers', 'screenPageViews'],
      dimensions: ['date'],
      limit: args.rangeDays + 5,
      subject,
    }),
    ga4RunReport({
      propertyId,
      startDate,
      endDate,
      metrics: ['activeUsers', 'screenPageViews'],
      dimensions: ['pagePath'],
      limit: 8,
      subject,
    }),
    ga4RunReport({
      propertyId,
      startDate,
      endDate,
      metrics: ['activeUsers', 'screenPageViews'],
      dimensions: ['sessionSource'],
      limit: 8,
      subject,
    }),
    ga4RunReport({
      propertyId,
      startDate,
      endDate,
      metrics: ['activeUsers', 'screenPageViews'],
      dimensions: ['country'],
      limit: 8,
      subject,
    }),
    ga4RunReport({
      propertyId,
      startDate,
      endDate,
      metrics: ['activeUsers', 'screenPageViews'],
      dimensions: ['deviceCategory'],
      limit: 6,
      subject,
    }),
    ga4RunReport({
      propertyId,
      startDate,
      endDate,
      metrics: ['activeUsers', 'screenPageViews'],
      dimensions: ['browser'],
      limit: 6,
      subject,
    }),
  ]);

  const t = totals.rows[0]?.metricValues ?? [0, 0, 0, 0];
  return {
    propertyId,
    rangeDays: args.rangeDays,
    metrics: {
      visitors: t[0] ?? 0,
      pageviews: t[1] ?? 0,
      bounceRate: t[2] != null ? t[2] * (t[2] <= 1 ? 100 : 1) : null,
      visitDuration: t[3] ?? null,
    },
    series: series.rows
      .map((row) => {
        const raw = row.dimensionValues[0] || '';
        const date =
          raw.length === 8
            ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
            : raw;
        return {
          date,
          visitors: row.metricValues[0] ?? 0,
          pageviews: row.metricValues[1] ?? 0,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date)),
    topPages: pages.rows.map((row) => ({
      label: row.dimensionValues[0] || '(not set)',
      visitors: row.metricValues[0] ?? 0,
      pageviews: row.metricValues[1] ?? 0,
    })),
    topSources: sources.rows.map((row) => ({
      label: row.dimensionValues[0] || '(not set)',
      visitors: row.metricValues[0] ?? 0,
      pageviews: row.metricValues[1] ?? 0,
    })),
    topCountries: countries.rows.map((row) => ({
      label: row.dimensionValues[0] || '(not set)',
      visitors: row.metricValues[0] ?? 0,
      pageviews: row.metricValues[1] ?? 0,
    })),
    topDevices: devices.rows.map((row) => ({
      label: row.dimensionValues[0] || '(not set)',
      visitors: row.metricValues[0] ?? 0,
      pageviews: row.metricValues[1] ?? 0,
    })),
    topBrowsers: browsers.rows.map((row) => ({
      label: row.dimensionValues[0] || '(not set)',
      visitors: row.metricValues[0] ?? 0,
      pageviews: row.metricValues[1] ?? 0,
    })),
  };
}
