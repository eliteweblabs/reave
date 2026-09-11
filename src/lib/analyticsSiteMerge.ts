/**
 * Pure merge / summary helpers for the Analytics fleet (no I/O).
 */
import { hostnameFromWebsite } from './plausibleClient';
import { isApexPublicWebsiteHost, normalizeMonitorHost } from './publicUrl';

function analyticsRowHasMetrics(row: AnalyticsAccountRow): boolean {
  return (
    row.registered ||
    row.visitors != null ||
    row.pageviews != null ||
    row.realtimeVisitors != null
  );
}

export type AnalyticsSiteKind = 'agency' | 'railway' | 'kinsta';

export type AnalyticsSiteOption = {
  siteId: string;
  label: string;
  kind: AnalyticsSiteKind;
  contactUid?: string;
  website?: string;
  sourceLabel?: string;
};

export type AnalyticsAccountRow = AnalyticsSiteOption & {
  registered: boolean;
  visitors: number | null;
  pageviews: number | null;
  realtimeVisitors: number | null;
  change: number | null;
  dashboardUrl: string | null;
  error?: string;
};

export type AnalyticsFleetPreview = {
  configured: boolean;
  rangeDays: number;
  siteCount: number;
  registeredCount: number;
  unregisteredCount: number;
  visitors: number;
  pageviews: number;
  realtimeVisitors: number;
  sites: AnalyticsAccountRow[];
};

/** Minimal uptime monitor fields needed to join with analytics apex sites. */
export type UptimeMonitorForFleetMerge = {
  id?: number | string;
  friendly_name?: string | null;
  url?: string | null;
  status?: number;
  is_paused?: boolean;
  is_offline?: boolean;
  is_down?: boolean;
  tile_label?: string | null;
  uptime_ratio_7d?: number | null;
};

/** One home-dashboard card: apex domain with optional uptime + analytics. */
export type DashboardSiteCard = {
  siteId: string;
  label: string;
  monitor: UptimeMonitorForFleetMerge | null;
  analytics: AnalyticsAccountRow | null;
};

/** Extra apex domains from persisted health / ignore stores (no live I/O). */
export type DashboardSiteCardMergeExtras = {
  siteHealthSites?: Record<string, unknown> | null;
  ignoredSiteIds?: string[] | null;
  /** When false, omit health-only ghost tiles (live fleet already defines the card list). */
  includeHealthOnlySites?: boolean;
};

function fleetCardRank(card: DashboardSiteCard): number {
  const registered = Boolean(card.analytics?.registered);
  const hasAnalytics = Boolean(card.analytics);
  const hasMonitor = Boolean(card.monitor);
  if (registered && hasMonitor) return 0;
  if (registered) return 1;
  if (hasAnalytics && hasMonitor) return 2;
  if (hasAnalytics) return 3;
  if (hasMonitor) return 4;
  return 5;
}

/** Keep one tile when multiple apex domains share the same Kinsta/Railway label. */
function collapseDashboardSiteCardsByLabel(cards: DashboardSiteCard[]): DashboardSiteCard[] {
  const byLabel = new Map<string, DashboardSiteCard[]>();
  for (const card of cards) {
    const key = card.label.trim().toLowerCase() || card.siteId.toLowerCase();
    const group = byLabel.get(key) ?? [];
    group.push(card);
    byLabel.set(key, group);
  }
  const kept: DashboardSiteCard[] = [];
  for (const group of byLabel.values()) {
    if (group.length === 1) {
      kept.push(group[0]!);
      continue;
    }
    group.sort((a, b) => {
      const rankDiff = fleetCardRank(a) - fleetCardRank(b);
      if (rankDiff) return rankDiff;
      return a.siteId.localeCompare(b.siteId, undefined, { sensitivity: 'base' });
    });
    kept.push(group[0]!);
  }
  return kept.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

export function mergeAnalyticsSites(
  parts: Array<AnalyticsSiteOption | null | undefined>,
): AnalyticsSiteOption[] {
  const seen = new Set<string>();
  const out: AnalyticsSiteOption[] = [];
  for (const row of parts) {
    if (!row) continue;
    const siteId = hostnameFromWebsite(row.siteId);
    if (!siteId || seen.has(siteId)) continue;
    seen.add(siteId);
    out.push({ ...row, siteId });
  }
  out.sort((a, b) => {
    const rank = (kind: AnalyticsSiteKind) =>
      kind === 'agency' ? 0 : kind === 'railway' ? 1 : 2;
    const byKind = rank(a.kind) - rank(b.kind);
    if (byKind) return byKind;
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });
  return out;
}

/**
 * Join UptimeRobot apex monitors with Plausible fleet rows into one card per apex.
 * Friendly monitor names win for labels; analytics-only rows keep sourceLabel / domain.
 */
function mergeExtraDashboardSiteIds(
  byId: Map<string, DashboardSiteCard>,
  extras?: DashboardSiteCardMergeExtras,
): void {
  if (extras?.includeHealthOnlySites !== false) {
    const healthSites = extras?.siteHealthSites;
    if (healthSites && typeof healthSites === 'object') {
      for (const siteId of Object.keys(healthSites)) {
        const host = hostnameFromWebsite(siteId) || normalizeMonitorHost(siteId);
        if (!host || !isApexPublicWebsiteHost(host) || byId.has(host)) continue;
        byId.set(host, {
          siteId: host,
          label: host,
          monitor: null,
          analytics: null,
        });
      }
    }
  }
  const ignored = extras?.ignoredSiteIds;
  if (Array.isArray(ignored)) {
    for (const raw of ignored) {
      const host = hostnameFromWebsite(raw) || normalizeMonitorHost(raw);
      if (!host || !isApexPublicWebsiteHost(host) || byId.has(host)) continue;
      byId.set(host, {
        siteId: host,
        label: host,
        monitor: null,
        analytics: null,
      });
    }
  }
}

export function mergeDashboardSiteCards(
  monitors: UptimeMonitorForFleetMerge[],
  analyticsSites: AnalyticsAccountRow[],
  extras?: DashboardSiteCardMergeExtras,
): DashboardSiteCard[] {
  const byId = new Map<string, DashboardSiteCard>();

  for (const site of analyticsSites) {
    const siteId = hostnameFromWebsite(site.siteId) || normalizeMonitorHost(site.siteId);
    if (!siteId || !isApexPublicWebsiteHost(siteId)) continue;
    byId.set(siteId, {
      siteId,
      label: site.sourceLabel || site.label || siteId,
      monitor: null,
      analytics: { ...site, siteId },
    });
  }

  for (const monitor of monitors) {
    const host = normalizeMonitorHost(monitor.url);
    if (!host || !isApexPublicWebsiteHost(host)) continue;
    const existing = byId.get(host);
    const friendly = typeof monitor.friendly_name === 'string' ? monitor.friendly_name.trim() : '';
    if (existing) {
      existing.monitor = monitor;
      if (friendly) existing.label = friendly;
      continue;
    }
    byId.set(host, {
      siteId: host,
      label: friendly || host,
      monitor,
      analytics: null,
    });
  }

  mergeExtraDashboardSiteIds(byId, extras);

  return collapseDashboardSiteCardsByLabel([...byId.values()]);
}

/** Union Plausible metrics preview with the persisted Railway/Kinsta apex list. */
export function mergeAnalyticsFleetPreviews(
  ...previews: Array<AnalyticsFleetPreview | null | undefined>
): AnalyticsFleetPreview | null {
  const rows = previews.filter((p): p is AnalyticsFleetPreview => Boolean(p));
  if (!rows.length) return null;

  const byId = new Map<string, AnalyticsAccountRow>();
  for (const preview of rows) {
    for (const site of preview.sites) {
      const siteId =
        hostnameFromWebsite(site.siteId) || normalizeMonitorHost(site.siteId) || site.siteId;
      if (!siteId) continue;
      const prev = byId.get(siteId);
      if (!prev) {
        byId.set(siteId, { ...site, siteId });
        continue;
      }
      const prevMetrics = analyticsRowHasMetrics(prev);
      const nextMetrics = analyticsRowHasMetrics(site);
      const metrics = prevMetrics && !nextMetrics ? prev : nextMetrics && !prevMetrics ? site : site;
      const meta = prevMetrics && !nextMetrics ? site : prev;
      byId.set(siteId, {
        ...meta,
        ...metrics,
        siteId,
        label: metrics.label || meta.label || siteId,
        sourceLabel: metrics.sourceLabel || meta.sourceLabel,
        kind: metrics.kind || meta.kind,
        website: metrics.website || meta.website,
      });
    }
  }

  const rangeDays = rows.find((r) => r.rangeDays)?.rangeDays ?? 30;
  const configured = rows.some((r) => r.configured);
  return summarizeAnalyticsAccounts([...byId.values()], rangeDays, { configured });
}

export function summarizeAnalyticsAccounts(
  accounts: AnalyticsAccountRow[],
  rangeDays: number,
  opts: { configured?: boolean; limit?: number } = {},
): AnalyticsFleetPreview {
  const registered = accounts.filter((row) => row.registered);
  // Home dashboard shows the full apex fleet (typically ~20–30 sites).
  const limit = opts.limit ?? accounts.length;
  return {
    configured: opts.configured !== false,
    rangeDays,
    siteCount: accounts.length,
    registeredCount: registered.length,
    unregisteredCount: accounts.length - registered.length,
    visitors: registered.reduce((sum, row) => sum + (row.visitors ?? 0), 0),
    pageviews: registered.reduce((sum, row) => sum + (row.pageviews ?? 0), 0),
    realtimeVisitors: registered.reduce((sum, row) => sum + (row.realtimeVisitors ?? 0), 0),
    sites: limit >= accounts.length ? accounts.slice() : accounts.slice(0, limit),
  };
}
