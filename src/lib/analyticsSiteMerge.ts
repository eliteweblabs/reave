/**
 * Pure merge / summary helpers for the Analytics fleet (no I/O).
 */
import { hostnameFromWebsite } from './plausibleClient';
import { isApexPublicWebsiteHost, normalizeMonitorHost } from './publicUrl';

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
export function mergeDashboardSiteCards(
  monitors: UptimeMonitorForFleetMerge[],
  analyticsSites: AnalyticsAccountRow[],
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

  return [...byId.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  );
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
