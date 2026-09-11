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
  listHostedAnalyticsSites,
  mergeAnalyticsSites,
  type AnalyticsSiteOption,
} from './analyticsSites';
import {
  hostnameFromWebsite,
  isPlausibleConfigured,
  isPlausibleSiteMissingError,
  plausibleAggregate,
  plausibleCreateSite,
  plausibleDashboardUrl,
  plausiblePeriodForDays,
  plausibleRealtimeVisitors,
  plausibleSitesNewUrl,
} from './plausibleClient';
import { isKinstaConfigured } from './kinstaClient';
import { isRailwayConfigured } from './railwayClient';
import {
  loadPersistedHostedFleetPreview,
  savePersistedHostedFleetPreview,
} from './hostedFleetStore';

export type { AnalyticsAccountRow, AnalyticsFleetPreview, DashboardSiteCard } from './analyticsSiteMerge';
export {
  mergeAnalyticsFleetPreviews,
  mergeDashboardSiteCards,
  summarizeAnalyticsAccounts,
} from './analyticsSiteMerge';

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
  opts: { includeRealtime?: boolean } = {},
): Promise<AnalyticsAccountRow> {
  const dashboardUrl = plausibleDashboardUrl(site.siteId);
  const base: AnalyticsAccountRow = {
    ...site,
    ...emptyMetrics(),
    dashboardUrl,
  };
  if (!isPlausibleConfigured()) return base;

  const period = plausiblePeriodForDays(rangeDays);
  const aggregate = await plausibleAggregate(site.siteId, period, ['visitors', 'pageviews'], true);
  const realtime =
    opts.includeRealtime === true
      ? await plausibleRealtimeVisitors(site.siteId)
      : { ok: false as const, error: 'skipped' };

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

export function isFleetDiscoveryConfigured(): boolean {
  return isPlausibleConfigured() || isRailwayConfigured() || isKinstaConfigured();
}

/** Railway + Kinsta apex domains with empty Plausible metrics — fast dashboard path. */
export async function buildHostedFleetPreview(
  companyDomain: string,
  opts: { freshHosted?: boolean; rangeDays?: number } = {},
): Promise<AnalyticsFleetPreview> {
  const rangeDays = opts.rangeDays === 7 || opts.rangeDays === 90 ? opts.rangeDays : 30;
  const [hosted, agencyOnly] = await Promise.all([
    listHostedAnalyticsSites({ fresh: opts.freshHosted }),
    listAnalyticsSites(companyDomain, { includeHosted: false }),
  ]);
  const sites = mergeAnalyticsSites([...agencyOnly, ...hosted.sites]);
  const accounts: AnalyticsAccountRow[] = sites.map((site) => ({
    ...site,
    ...emptyMetrics(),
    dashboardUrl: plausibleDashboardUrl(site.siteId),
  }));
  return summarizeAnalyticsAccounts(accounts, rangeDays, {
    configured: isPlausibleConfigured(),
  });
}

export async function listAnalyticsAccounts(
  companyDomain: string,
  opts: { rangeDays?: number; includeHosted?: boolean; freshHosted?: boolean } = {},
): Promise<{
  configured: boolean;
  rangeDays: number;
  railwayConfigured: boolean;
  kinstaConfigured: boolean;
  accounts: AnalyticsAccountRow[];
  warnings: string[];
}> {
  const rangeDays = opts.rangeDays === 7 || opts.rangeDays === 90 ? opts.rangeDays : 30;
  const includeHosted = opts.includeHosted !== false;
  const [hosted, agencyOnly] = await Promise.all([
    includeHosted
      ? listHostedAnalyticsSites({ fresh: opts.freshHosted })
      : Promise.resolve({ sites: [] as AnalyticsSiteOption[], warnings: [] as string[] }),
    listAnalyticsSites(companyDomain, { includeHosted: false }),
  ]);
  const sites = includeHosted
    ? mergeAnalyticsSites([...agencyOnly, ...hosted.sites])
    : agencyOnly;

  const accounts = await mapPool(sites, ANALYTICS_ACCOUNT_CONCURRENCY, (site) =>
    loadAnalyticsAccountRow(site, rangeDays),
  );
  return {
    configured: isPlausibleConfigured(),
    rangeDays,
    railwayConfigured: isRailwayConfigured(),
    kinstaConfigured: isKinstaConfigured(),
    accounts,
    warnings: hosted.warnings,
  };
}

const PREVIEW_TTL_MS = 5 * 60_000;
const HOSTED_PREVIEW_TTL_MS = 5 * 60_000;
const ACCOUNTS_LIST_TTL_MS = 3 * 60_000;
const ANALYTICS_ACCOUNT_CONCURRENCY = 6;

type AnalyticsAccountsList = Awaited<ReturnType<typeof listAnalyticsAccounts>>;

let accountsListCache: {
  at: number;
  domain: string;
  rangeDays: number;
  result: AnalyticsAccountsList;
} | null = null;
let accountsListInflight: Promise<AnalyticsAccountsList> | null = null;
let accountsListInflightKey = '';

let previewCache: { at: number; domain: string; preview: AnalyticsFleetPreview } | null = null;
let previewInflight: Promise<AnalyticsFleetPreview> | null = null;
let previewInflightDomain = '';
type HostedPreviewCacheEntry = {
  at: number;
  domain: string;
  preview: AnalyticsFleetPreview;
  /** Postgres/file snapshot — never blocks live Railway/Kinsta discovery. */
  fromPersisted?: boolean;
};

let hostedPreviewCache: HostedPreviewCacheEntry | null = null;
let hostedPreviewInflight: Promise<AnalyticsFleetPreview> | null = null;
let hostedPreviewInflightDomain = '';
let hostedHydratePromise: Promise<void> | null = null;

/** Full fleet metrics — cached briefly; sidebar/overview hydration only. */
export async function listAnalyticsAccountsCached(
  companyDomain: string,
  opts: { rangeDays?: number; includeHosted?: boolean; freshHosted?: boolean; fresh?: boolean } = {},
): Promise<AnalyticsAccountsList> {
  const rangeDays = opts.rangeDays === 7 || opts.rangeDays === 90 ? opts.rangeDays : 30;
  const domain = previewCacheDomain(companyDomain);
  const cacheKey = `${domain}:${rangeDays}:${opts.includeHosted === false ? 'agency' : 'hosted'}`;

  if (!opts.fresh) {
    if (
      accountsListCache &&
      accountsListCache.domain === domain &&
      accountsListCache.rangeDays === rangeDays &&
      Date.now() - accountsListCache.at < ACCOUNTS_LIST_TTL_MS
    ) {
      return accountsListCache.result;
    }
    if (accountsListInflight && accountsListInflightKey === cacheKey) return accountsListInflight;
  } else if (accountsListInflight && accountsListInflightKey === cacheKey) {
    return accountsListInflight;
  }

  const pending = listAnalyticsAccounts(companyDomain, {
    rangeDays,
    includeHosted: opts.includeHosted,
    freshHosted: opts.freshHosted,
  }).then((result) => {
    accountsListCache = { at: Date.now(), domain, rangeDays, result };
    return result;
  });

  accountsListInflight = pending;
  accountsListInflightKey = cacheKey;
  try {
    return await pending;
  } finally {
    if (accountsListInflight === pending) {
      accountsListInflight = null;
      accountsListInflightKey = '';
    }
  }
}

/** Load last hosted fleet list from Postgres / knowledge file into memory when empty. */
export async function hydrateHostedFleetCache(companyDomain: string): Promise<void> {
  const domain = previewCacheDomain(companyDomain);
  if (hostedPreviewCache?.domain === domain) return;
  if (hostedHydratePromise) {
    await hostedHydratePromise;
    return;
  }
  hostedHydratePromise = (async () => {
    try {
      const snapshot = await loadPersistedHostedFleetPreview();
      if (snapshot?.preview.sites?.length && !hostedPreviewCache) {
        hostedPreviewCache = {
          at: snapshot.savedAtMs || 0,
          domain,
          preview: snapshot.preview,
          fromPersisted: true,
        };
      }
    } catch (e) {
      console.warn('[analytics-fleet] hosted hydrate failed:', e instanceof Error ? e.message : e);
    } finally {
      hostedHydratePromise = null;
    }
  })();
  await hostedHydratePromise;
}

function previewCacheDomain(companyDomain: string): string {
  return hostnameFromWebsite(companyDomain) || companyDomain.trim().toLowerCase();
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

export function peekCachedAnalyticsDashboardPreview(
  companyDomain: string,
  opts: { allowStale?: boolean } = {},
): AnalyticsFleetPreview | null {
  if (!previewCache) return null;
  const domain = previewCacheDomain(companyDomain);
  if (previewCache.domain !== domain) return null;
  if (!opts.allowStale && Date.now() - previewCache.at > PREVIEW_TTL_MS) return null;
  return previewCache.preview;
}

export function peekCachedHostedFleetPreview(
  companyDomain: string,
  opts: { allowStale?: boolean; allowPersisted?: boolean } = {},
): AnalyticsFleetPreview | null {
  if (!hostedPreviewCache) return null;
  const domain = previewCacheDomain(companyDomain);
  if (hostedPreviewCache.domain !== domain) return null;
  if (hostedPreviewCache.fromPersisted && !opts.allowPersisted && !opts.allowStale) return null;
  if (!opts.allowStale && Date.now() - hostedPreviewCache.at > HOSTED_PREVIEW_TTL_MS) return null;
  return hostedPreviewCache.preview;
}

async function refreshHostedFleetPreview(
  companyDomain: string,
  freshHosted?: boolean,
): Promise<AnalyticsFleetPreview> {
  const domain = previewCacheDomain(companyDomain);
  const preview = await buildHostedFleetPreview(companyDomain, { freshHosted });
  hostedPreviewCache = { at: Date.now(), domain, preview };
  void savePersistedHostedFleetPreview(preview).catch((e) => {
    console.warn('[analytics-fleet] hosted persist failed:', e instanceof Error ? e.message : e);
  });
  return preview;
}

/** Cached Railway + Kinsta apex list — no Plausible calls. */
export async function buildHostedFleetPreviewCached(
  companyDomain: string,
  opts: {
    fresh?: boolean;
    freshHosted?: boolean;
    /** Dashboard fleet cards: always hit Railway/Kinsta (5m in-memory TTL). */
    requireLive?: boolean;
  } = {},
): Promise<AnalyticsFleetPreview> {
  const domain = previewCacheDomain(companyDomain);

  if (!opts.fresh) {
    const live = peekCachedHostedFleetPreview(companyDomain);
    if (live) return live;
    if (hostedPreviewInflight && hostedPreviewInflightDomain === domain) return hostedPreviewInflight;
  } else if (hostedPreviewInflight && hostedPreviewInflightDomain === domain) {
    return hostedPreviewInflight;
  }

  if (!opts.fresh && !opts.requireLive) {
    await hydrateHostedFleetCache(companyDomain);
    const stale = peekCachedHostedFleetPreview(companyDomain, {
      allowStale: true,
      allowPersisted: true,
    });
    if (stale) {
      if (!hostedPreviewInflight || hostedPreviewInflightDomain !== domain) {
        const pending = refreshHostedFleetPreview(companyDomain, opts.freshHosted);
        hostedPreviewInflight = pending;
        hostedPreviewInflightDomain = domain;
        void pending.finally(() => {
          if (hostedPreviewInflight === pending) {
            hostedPreviewInflight = null;
            hostedPreviewInflightDomain = '';
          }
        });
      }
      return stale;
    }
  }

  const pending = refreshHostedFleetPreview(companyDomain, opts.freshHosted);
  hostedPreviewInflight = pending;
  hostedPreviewInflightDomain = domain;
  try {
    return await pending;
  } finally {
    if (hostedPreviewInflight === pending) {
      hostedPreviewInflight = null;
      hostedPreviewInflightDomain = '';
    }
  }
}

export function invalidateAnalyticsDashboardPreview(): void {
  previewCache = null;
  previewInflight = null;
  previewInflightDomain = '';
  hostedPreviewCache = null;
  hostedPreviewInflight = null;
  hostedPreviewInflightDomain = '';
  accountsListCache = null;
  accountsListInflight = null;
  accountsListInflightKey = '';
}

export async function buildAnalyticsDashboardPreview(
  companyDomain: string,
  opts: { fresh?: boolean } = {},
): Promise<AnalyticsFleetPreview> {
  const domain = previewCacheDomain(companyDomain);
  if (!opts.fresh) {
    const cached = peekCachedAnalyticsDashboardPreview(companyDomain);
    if (cached) return cached;
    if (previewInflight && previewInflightDomain === domain) return previewInflight;
  } else if (previewInflight && previewInflightDomain === domain) {
    return previewInflight;
  }

  if (!isFleetDiscoveryConfigured()) {
    return summarizeAnalyticsAccounts([], 30, { configured: false });
  }

  if (!isPlausibleConfigured()) {
    return buildHostedFleetPreviewCached(companyDomain, { fresh: opts.fresh, freshHosted: opts.fresh });
  }

  const pending = (async () => {
    const { accounts } = await listAnalyticsAccountsCached(companyDomain, {
      rangeDays: 30,
      includeHosted: true,
    });
    const preview = summarizeAnalyticsAccounts(accounts, 30, { configured: true });
    previewCache = { at: Date.now(), domain, preview };
    return preview;
  })();

  previewInflight = pending;
  previewInflightDomain = domain;
  try {
    return await pending;
  } finally {
    if (previewInflight === pending) {
      previewInflight = null;
      previewInflightDomain = '';
    }
  }
}

/** Register Plausible sites for every Railway + Kinsta apex domain. */
export async function syncPlausibleSitesFromHosted(): Promise<AnalyticsSyncResult> {
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
  if (!isRailwayConfigured() && !isKinstaConfigured()) {
    return {
      ...empty,
      errors: ['Neither RAILWAY_API_TOKEN nor Kinsta API credentials are set'],
    };
  }

  const hosted = await listHostedAnalyticsSites({ fresh: true });
  const addUrl = plausibleSitesNewUrl() || '';
  const result: AnalyticsSyncResult = {
    ...empty,
    ok: true,
    discovered: hosted.sites.length,
    warnings: [...hosted.warnings],
  };

  for (const site of hosted.sites) {
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

/** @deprecated Use syncPlausibleSitesFromHosted — Railway + Kinsta apex domains. */
export const syncPlausibleSitesFromRailway = syncPlausibleSitesFromHosted;
