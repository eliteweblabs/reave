/**
 * Plausible Analytics Stats API client (self-hosted or cloud).
 *
 * Uses the v1 REST endpoints — widely supported on Community Edition.
 * Docs: https://plausible.io/docs/stats-api
 */
import { serverEnv } from './serverEnv';

function trim(v: string | undefined): string {
  return (v ?? '').trim();
}

function apiBase(): string | null {
  const raw = trim(serverEnv('PLAUSIBLE_API_BASE_URL'));
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

function apiKey(): string | null {
  return trim(serverEnv('PLAUSIBLE_API_KEY')) || null;
}

export function isPlausibleConfigured(): boolean {
  return Boolean(apiBase() && apiKey());
}

export function plausibleDashboardUrl(siteId: string): string | null {
  const base = apiBase();
  if (!base || !siteId) return null;
  return `${base}/${encodeURIComponent(siteId)}`;
}

/** Site id in Plausible (usually the bare domain). */
export function plausibleSiteId(companyDomain?: string): string {
  const fromEnv = trim(serverEnv('PLAUSIBLE_SITE_ID'));
  if (fromEnv) return fromEnv;
  const domain = trim(companyDomain)
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  return domain;
}

export function plausiblePeriodForDays(days: number): string {
  if (days === 7) return '7d';
  if (days === 90) return '91d';
  return '30d';
}

type PlausibleFetchResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function plausibleGet<T>(
  path: string,
  params: Record<string, string>,
): Promise<PlausibleFetchResult<T>> {
  const base = apiBase();
  const key = apiKey();
  if (!base || !key) return { ok: false, error: 'Plausible is not configured' };

  const url = new URL(path.startsWith('/') ? path : `/${path}`, `${base}/`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: `Plausible ${res.status}${text ? `: ${text.slice(0, 240)}` : ''}`,
      };
    }
    try {
      return { ok: true, data: JSON.parse(text) as T };
    } catch {
      return { ok: false, error: 'Plausible returned invalid JSON' };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Plausible request failed' };
  }
}

export type PlausibleAggregateResult = {
  results?: Record<string, { value?: number; change?: number }>;
};

export async function plausibleAggregate(
  siteId: string,
  period: string,
  metrics: string[],
  compare = true,
): Promise<PlausibleFetchResult<PlausibleAggregateResult>> {
  const params: Record<string, string> = {
    site_id: siteId,
    period,
    metrics: metrics.join(','),
  };
  if (compare) params.compare = 'previous_period';
  return plausibleGet<PlausibleAggregateResult>('/api/v1/stats/aggregate', params);
}

export type PlausibleTimeseriesRow = {
  date?: string;
  visitors?: number;
  pageviews?: number;
};

export type PlausibleTimeseriesResult = {
  results?: PlausibleTimeseriesRow[];
};

export async function plausibleTimeseries(
  siteId: string,
  period: string,
  metrics: string[],
): Promise<PlausibleFetchResult<PlausibleTimeseriesResult>> {
  return plausibleGet<PlausibleTimeseriesResult>('/api/v1/stats/timeseries', {
    site_id: siteId,
    period,
    metrics: metrics.join(','),
  });
}

export type PlausibleBreakdownRow = Record<string, string | number | undefined>;

export type PlausibleBreakdownResult = {
  results?: PlausibleBreakdownRow[];
};

export async function plausibleBreakdown(
  siteId: string,
  period: string,
  property: string,
  limit = 10,
): Promise<PlausibleFetchResult<PlausibleBreakdownResult>> {
  return plausibleGet<PlausibleBreakdownResult>('/api/v1/stats/breakdown', {
    site_id: siteId,
    period,
    property,
    limit: String(limit),
  });
}

export type PlausibleRealtimeResult = {
  visitors?: number;
};

export async function plausibleRealtimeVisitors(
  siteId: string,
): Promise<PlausibleFetchResult<PlausibleRealtimeResult>> {
  return plausibleGet<PlausibleRealtimeResult>('/api/v1/stats/realtime/visitors', {
    site_id: siteId,
  });
}
