/**
 * Scan → auto-wire → re-scan pipeline for Sites fleet readiness grades.
 */
import {
  buildAnalyticsDashboardPreview,
  invalidateAnalyticsDashboardPreview,
} from './analyticsFleet';
import { mergeDashboardSiteCards } from './analyticsSiteMerge';
import { warmFleetPageSpeedCache } from './fleetPageSpeedCache';
import {
  buildSiteHealthFleet,
  invalidateSiteHealthFleetCache,
  type SiteHealthCardInput,
} from './siteHealthGrade';
import type { SiteHealthFleet } from './siteHealthScore';
import type { SiteReadinessItem } from './siteReadinessChecklist';
import type { SiteFleetIgnoreState } from './siteFleetIgnore';
import { wireFleetSites, type SiteWireFleetResult } from './siteWiring';
import { hostnameFromWebsite } from './plausibleClient';
import { normalizeMonitorHost } from './publicUrl';

export type FleetScoreRemainingItem = {
  id: string;
  label: string;
  status: string;
  detail: string;
  autoFixable: boolean;
};

export type FleetScoreSiteReport = {
  siteId: string;
  grade: string | null;
  okCount: number;
  totalCount: number;
  fixed: string[];
  remaining: FleetScoreRemainingItem[];
};

export type FleetScoreReport = {
  scanned: number;
  wired: number;
  pageSpeedProbed: number;
  sites: FleetScoreSiteReport[];
  summary: string;
};

const AUTO_FIXABLE_IDS = new Set([
  'search_console',
  'xml_sitemap',
  'analytics',
]);

function siteHost(card: SiteHealthCardInput): string {
  return (
    hostnameFromWebsite(card.website || '') ||
    hostnameFromWebsite(card.siteId) ||
    normalizeMonitorHost(card.siteId) ||
    card.siteId
  );
}

function remainingItems(items: SiteReadinessItem[] | undefined): FleetScoreRemainingItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item.status !== 'ok')
    .map((item) => ({
      id: item.id,
      label: item.label,
      status: item.status,
      detail: item.detail,
      autoFixable: AUTO_FIXABLE_IDS.has(item.id),
    }));
}

function fixedLabels(before: SiteHealthFleet | null, after: SiteHealthFleet, siteId: string): string[] {
  const prevItems = before?.sites?.[siteId]?.readiness?.items ?? [];
  const nextItems = after.sites?.[siteId]?.readiness?.items ?? [];
  const fixed: string[] = [];
  for (const next of nextItems) {
    const prev = prevItems.find((item) => item.id === next.id);
    if (prev && prev.status !== 'ok' && next.status === 'ok') {
      fixed.push(next.label);
    }
  }
  return fixed;
}

function buildReport(
  before: SiteHealthFleet | null,
  after: SiteHealthFleet,
  wireResult: SiteWireFleetResult,
  pageSpeedProbed: number,
): FleetScoreReport {
  const sites: FleetScoreSiteReport[] = Object.keys(after.sites)
    .sort()
    .map((siteId) => {
      const row = after.sites[siteId]!;
      return {
        siteId,
        grade: row.grade,
        okCount: row.readiness?.okCount ?? 0,
        totalCount: row.readiness?.totalCount ?? 0,
        fixed: fixedLabels(before, after, siteId),
        remaining: remainingItems(row.readiness?.items),
      };
    });

  const improved = sites.filter((s) => s.fixed.length > 0).length;
  const manual = sites.reduce((n, s) => n + s.remaining.filter((r) => !r.autoFixable).length, 0);
  const summary =
    wireResult.wired > 0 || improved > 0
      ? `Auto-fixed ${wireResult.wired} wiring gap(s) across ${improved} site(s). ${manual} manual item(s) left.`
      : manual > 0
        ? `${manual} item(s) still need content or plugin work.`
        : 'Fleet looks fully wired.';

  return {
    scanned: after.siteCount,
    wired: wireResult.wired,
    pageSpeedProbed,
    sites,
    summary,
  };
}

export async function improveFleetScores(input: {
  cards: SiteHealthCardInput[];
  ignore: SiteFleetIgnoreState | null;
  companyDomain: string;
  includePageSpeed?: boolean;
  pageSpeedFresh?: boolean;
  /** Reload fleet cards after wiring (Plausible registration updates analytics rows). */
  reloadCards?: () => Promise<SiteHealthCardInput[]>;
}): Promise<{
  siteHealth: SiteHealthFleet;
  wireResult: SiteWireFleetResult;
  report: FleetScoreReport;
}> {
  const includePageSpeed = input.includePageSpeed !== false;
  let cards = input.cards;

  const urls = cards
    .map((card) => siteHost(card))
    .filter(Boolean)
    .map((host) => `https://${host.replace(/^www\./, '')}/`);

  let pageSpeedProbed = 0;
  if (includePageSpeed && urls.length) {
    pageSpeedProbed = await warmFleetPageSpeedCache(urls, {
      fresh: input.pageSpeedFresh === true,
      concurrency: 1,
    });
  }

  const before = await buildSiteHealthFleet(cards, { fresh: true });
  const wireResult = await wireFleetSites(cards, before, input.ignore);

  if (wireResult.wired > 0) {
    invalidateSiteHealthFleetCache();
    invalidateAnalyticsDashboardPreview();
    await buildAnalyticsDashboardPreview(input.companyDomain, { fresh: true }).catch(() => null);
    if (input.reloadCards) {
      cards = await input.reloadCards();
    }
  }

  const after = await buildSiteHealthFleet(cards, { fresh: true });
  const report = buildReport(before, after, wireResult, pageSpeedProbed);

  return { siteHealth: after, wireResult, report };
}

/** Merge dashboard cards after analytics refresh (Plausible registration may have changed). */
export function fleetCardsFromMonitorsAndAnalytics(
  monitors: Parameters<typeof mergeDashboardSiteCards>[0],
  analyticsSites: Parameters<typeof mergeDashboardSiteCards>[1],
): SiteHealthCardInput[] {
  return mergeDashboardSiteCards(monitors, analyticsSites).map((card) => ({
    siteId: card.siteId,
    website: card.analytics?.website ?? null,
    monitor: card.monitor,
    analytics: card.analytics,
  }));
}
