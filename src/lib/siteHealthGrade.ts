/**
 * Sites fleet health grades — lightweight critical checks with a long SWR cache.
 *
 * Not a full website audit. Probes robots.txt + Search Console coverage and
 * folds in uptime / Plausible signals already on the dashboard. Expensive
 * Lighthouse / full seo_inventory stays on the audit playbook.
 */
import {
  agencySubject,
  getIntegrationToken,
} from './integrationTokens';
import {
  GOOGLE_WEBMASTER_PROVIDER,
  isGoogleWebmasterOAuthConfigured,
} from './googleWebmasterAuth';
import {
  gscListSites,
  gscPropertyCandidates,
  type GscSiteEntry,
} from './googleSearchConsoleClient';
import { robotsTxtBlocksAll } from './seoInventoryClient';
import { hostnameFromWebsite } from './plausibleClient';
import { isApexPublicWebsiteHost, normalizeMonitorHost } from './publicUrl';
import { hasFeature } from './features';
import type {
  AnalyticsAccountRow,
  UptimeMonitorForFleetMerge,
} from './analyticsSiteMerge';
import {
  collectInstantSiteHealthIssues,
  scoreSiteHealthIssues,
  type SiteHealthFleet,
  type SiteHealthSummary,
} from './siteHealthScore';

export type {
  SiteHealthFleet,
  SiteHealthIssue,
  SiteHealthIssueCode,
  SiteHealthSummary,
} from './siteHealthScore';
export { collectInstantSiteHealthIssues, scoreSiteHealthIssues } from './siteHealthScore';

export type SiteHealthCardInput = {
  siteId: string;
  website?: string | null;
  monitor?: UptimeMonitorForFleetMerge | null;
  analytics?: AnalyticsAccountRow | null;
};

const HEALTH_TTL_MS = 45 * 60_000;
const ROBOTS_TIMEOUT_MS = 5_000;
const PROBE_CONCURRENCY = 4;

let healthCache: { at: number; fleet: SiteHealthFleet } | null = null;
let healthInflight: Promise<SiteHealthFleet> | null = null;

export function peekCachedSiteHealthFleet(
  opts: { allowStale?: boolean } = {},
): SiteHealthFleet | null {
  if (!healthCache) return null;
  if (!opts.allowStale && Date.now() - healthCache.at > HEALTH_TTL_MS) return null;
  if (opts.allowStale && Date.now() - healthCache.at > HEALTH_TTL_MS) {
    return {
      ...healthCache.fleet,
      sites: Object.fromEntries(
        Object.entries(healthCache.fleet.sites).map(([id, row]) => [
          id,
          { ...row, stale: true },
        ]),
      ),
    };
  }
  return healthCache.fleet;
}

async function probeRobotsTxt(
  siteId: string,
  website?: string | null,
): Promise<{ present: boolean; blocksAll: boolean } | null> {
  const host = hostnameFromWebsite(website || '') || normalizeMonitorHost(siteId) || siteId;
  if (!host) return null;
  const url = `https://${host.replace(/^www\./, '')}/robots.txt`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'text/plain,*/*', 'User-Agent': 'reave-sites-health/1.0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS),
    });
    if (res.status === 404) return { present: false, blocksAll: false };
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return { present: false, blocksAll: false };
    return { present: true, blocksAll: robotsTxtBlocksAll(text) };
  } catch {
    return null;
  }
}

async function agencyGoogleConnected(): Promise<boolean | null> {
  if (!isGoogleWebmasterOAuthConfigured()) return false;
  try {
    const token = await getIntegrationToken(agencySubject(), GOOGLE_WEBMASTER_PROVIDER);
    return Boolean(token?.accessToken || token?.refreshToken);
  } catch {
    return null;
  }
}

function gscHasApex(entries: GscSiteEntry[] | null, siteId: string): boolean | null {
  if (!entries) return null;
  const candidates = new Set(gscPropertyCandidates(siteId).map((c) => c.toLowerCase()));
  return entries.some((e) => {
    const url = (e.siteUrl || '').trim().toLowerCase();
    return url && candidates.has(url);
  });
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker()),
  );
  return results;
}

export async function buildSiteHealthFleet(
  cards: SiteHealthCardInput[],
  opts: { fresh?: boolean } = {},
): Promise<SiteHealthFleet> {
  if (!opts.fresh) {
    const cached = peekCachedSiteHealthFleet();
    if (cached) return cached;
    if (healthInflight) return healthInflight;
  } else if (healthInflight) {
    return healthInflight;
  }

  const apexCards = cards.filter((c) => {
    const id = hostnameFromWebsite(c.siteId) || normalizeMonitorHost(c.siteId);
    return id && isApexPublicWebsiteHost(id);
  });

  const pending = (async (): Promise<SiteHealthFleet> => {
    const googleConnected = await agencyGoogleConnected();
    let gscEntries: GscSiteEntry[] | null = null;
    if (googleConnected) {
      try {
        gscEntries = await gscListSites(agencySubject());
      } catch {
        gscEntries = null;
      }
    }

    const robotsResults = await mapPool(apexCards, PROBE_CONCURRENCY, (card) =>
      probeRobotsTxt(card.siteId, card.website || card.analytics?.website),
    );

    const checkedAt = Date.now();
    const sites: Record<string, SiteHealthSummary> = {};
    for (let i = 0; i < apexCards.length; i++) {
      const card = apexCards[i]!;
      const siteId =
        hostnameFromWebsite(card.siteId) || normalizeMonitorHost(card.siteId) || card.siteId;
      const issues = collectInstantSiteHealthIssues({
        monitor: card.monitor,
        analytics: card.analytics,
        googleConnected,
        gscHasProperty: googleConnected ? gscHasApex(gscEntries, siteId) : null,
        robots: robotsResults[i] ?? null,
      });
      const scored = scoreSiteHealthIssues(issues);
      sites[siteId] = {
        grade: scored.grade,
        score: scored.score,
        criticalCount: scored.criticalCount,
        issues,
        checkedAt,
      };
    }

    const fleet: SiteHealthFleet = {
      checkedAt,
      googleConnected,
      siteCount: Object.keys(sites).length,
      criticalSites: Object.values(sites).filter((s) => s.criticalCount > 0).length,
      sites,
    };
    healthCache = { at: checkedAt, fleet };
    return fleet;
  })();

  healthInflight = pending;
  try {
    return await pending;
  } finally {
    if (healthInflight === pending) healthInflight = null;
  }
}

/** Kick a background rebuild when Sites is enabled and cache is missing/stale. */
export function scheduleSiteHealthFleetRefresh(cards: SiteHealthCardInput[]): void {
  if (!hasFeature('analytic_audit') && !hasFeature('uptime_monitoring')) return;
  if (!cards.length) return;
  const fresh = peekCachedSiteHealthFleet();
  void buildSiteHealthFleet(cards, { fresh: !fresh }).catch((e) => {
    console.error('[site-health] refresh failed:', e instanceof Error ? e.message : e);
  });
}
