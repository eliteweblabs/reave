/**
 * Pure merge / summary helpers for the Analytics fleet (no I/O).
 */
import { hostnameFromWebsite } from './plausibleClient';

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

export function summarizeAnalyticsAccounts(
  accounts: AnalyticsAccountRow[],
  rangeDays: number,
  opts: { configured?: boolean; limit?: number } = {},
): AnalyticsFleetPreview {
  const registered = accounts.filter((row) => row.registered);
  const limit = opts.limit ?? 12;
  return {
    configured: opts.configured !== false,
    rangeDays,
    siteCount: accounts.length,
    registeredCount: registered.length,
    unregisteredCount: accounts.length - registered.length,
    visitors: registered.reduce((sum, row) => sum + (row.visitors ?? 0), 0),
    pageviews: registered.reduce((sum, row) => sum + (row.pageviews ?? 0), 0),
    realtimeVisitors: registered.reduce((sum, row) => sum + (row.realtimeVisitors ?? 0), 0),
    sites: accounts.slice(0, limit),
  };
}
