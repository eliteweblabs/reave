/**
 * Google Search Console API client (webmasters v3 + URL Inspection).
 */
import {
  AnalyticsApiError,
  AnalyticsAuthError,
  getGoogleWebmasterAccessToken,
} from './googleWebmasterAuth';
import type { IntegrationSubject } from './integrationTokens';
import { agencySubject } from './integrationTokens';

function encodeSiteUrl(siteUrl: string): string {
  return encodeURIComponent(siteUrl.trim());
}

async function gscFetch<T>(
  path: string,
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

  const method = opts.method ?? 'GET';
  const url = path.startsWith('https://')
    ? path
    : `https://www.googleapis.com/webmasters/v3${path.startsWith('/') ? path : `/${path}`}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(opts.body != null ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new AnalyticsAuthError(
      `Search Console auth failed (${res.status}): ${text.slice(0, 240) || res.statusText}`,
    );
  }
  if (res.status === 429) {
    throw new AnalyticsApiError(
      `Search Console quota exceeded (429). Wait and retry later — do not invent metrics. ${text.slice(0, 200)}`,
      429,
    );
  }
  if (!res.ok) {
    throw new AnalyticsApiError(
      `Search Console ${res.status}: ${text.slice(0, 400) || res.statusText}`,
      res.status,
    );
  }
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AnalyticsApiError('Search Console returned invalid JSON');
  }
}

export type GscSiteEntry = {
  siteUrl?: string;
  permissionLevel?: string;
};

export async function gscListSites(
  subject: IntegrationSubject = agencySubject(),
): Promise<GscSiteEntry[]> {
  const data = await gscFetch<{ siteEntry?: GscSiteEntry[] }>('/sites', { subject });
  return Array.isArray(data.siteEntry) ? data.siteEntry : [];
}

export async function gscGetSite(
  siteUrl: string,
  subject: IntegrationSubject = agencySubject(),
): Promise<GscSiteEntry> {
  return gscFetch<GscSiteEntry>(`/sites/${encodeSiteUrl(siteUrl)}`, { subject });
}

export async function gscAddSite(
  siteUrl: string,
  subject: IntegrationSubject = agencySubject(),
): Promise<void> {
  await gscFetch(`/sites/${encodeSiteUrl(siteUrl)}`, { method: 'PUT', subject });
}

export async function gscDeleteSite(
  siteUrl: string,
  subject: IntegrationSubject = agencySubject(),
): Promise<void> {
  await gscFetch(`/sites/${encodeSiteUrl(siteUrl)}`, { method: 'DELETE', subject });
}

export type GscSearchAnalyticsQuery = {
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
  startRow?: number;
  searchType?: string;
  dimensionFilterGroups?: unknown[];
  aggregationType?: string;
  subject?: IntegrationSubject;
};

export type GscSearchAnalyticsRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

export async function gscSearchAnalytics(
  query: GscSearchAnalyticsQuery,
): Promise<{ rows: GscSearchAnalyticsRow[]; responseAggregationType?: string }> {
  const subject = query.subject ?? agencySubject();
  const body: Record<string, unknown> = {
    startDate: query.startDate,
    endDate: query.endDate,
    rowLimit: Math.min(Math.max(query.rowLimit ?? 25, 1), 25000),
    startRow: query.startRow ?? 0,
  };
  if (query.dimensions?.length) body.dimensions = query.dimensions;
  if (query.searchType) body.searchType = query.searchType;
  if (query.dimensionFilterGroups) body.dimensionFilterGroups = query.dimensionFilterGroups;
  if (query.aggregationType) body.aggregationType = query.aggregationType;

  const data = await gscFetch<{
    rows?: GscSearchAnalyticsRow[];
    responseAggregationType?: string;
  }>(`/sites/${encodeSiteUrl(query.siteUrl)}/searchAnalytics/query`, {
    method: 'POST',
    body,
    subject,
  });
  return {
    rows: Array.isArray(data.rows) ? data.rows : [],
    responseAggregationType: data.responseAggregationType,
  };
}

export type GscSitemap = {
  path?: string;
  lastSubmitted?: string;
  isPending?: boolean;
  isSitemapsIndex?: boolean;
  type?: string;
  warnings?: string;
  errors?: string;
};

export async function gscListSitemaps(
  siteUrl: string,
  subject: IntegrationSubject = agencySubject(),
): Promise<GscSitemap[]> {
  const data = await gscFetch<{ sitemap?: GscSitemap[] }>(
    `/sites/${encodeSiteUrl(siteUrl)}/sitemaps`,
    { subject },
  );
  return Array.isArray(data.sitemap) ? data.sitemap : [];
}

export async function gscSubmitSitemap(
  siteUrl: string,
  feedpath: string,
  subject: IntegrationSubject = agencySubject(),
): Promise<void> {
  await gscFetch(`/sites/${encodeSiteUrl(siteUrl)}/sitemaps/${encodeSiteUrl(feedpath)}`, {
    method: 'PUT',
    subject,
  });
}

export async function gscDeleteSitemap(
  siteUrl: string,
  feedpath: string,
  subject: IntegrationSubject = agencySubject(),
): Promise<void> {
  await gscFetch(`/sites/${encodeSiteUrl(siteUrl)}/sitemaps/${encodeSiteUrl(feedpath)}`, {
    method: 'DELETE',
    subject,
  });
}

export type GscUrlInspectionResult = {
  inspectionResult?: {
    inspectionResultLink?: string;
    indexStatusResult?: Record<string, unknown>;
    ampResult?: Record<string, unknown>;
    richResultsResult?: Record<string, unknown>;
  };
};

export async function gscInspectUrl(args: {
  inspectionUrl: string;
  siteUrl: string;
  languageCode?: string;
  subject?: IntegrationSubject;
}): Promise<GscUrlInspectionResult> {
  const subject = args.subject ?? agencySubject();
  return gscFetch<GscUrlInspectionResult>(
    'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
    {
      method: 'POST',
      subject,
      body: {
        inspectionUrl: args.inspectionUrl,
        siteUrl: args.siteUrl,
        languageCode: args.languageCode || 'en-US',
      },
    },
  );
}

/** Normalize a hostname or URL into common GSC property candidates. */
export function gscPropertyCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('sc-domain:')) return [trimmed];
  let host = trimmed.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  host = host.split('/')[0]?.split('?')[0] ?? host;
  host = host.replace(/^www\./i, '');
  if (!host) return [];
  return [
    `sc-domain:${host}`,
    `https://${host}/`,
    `https://www.${host}/`,
    `http://${host}/`,
    `http://www.${host}/`,
  ];
}
