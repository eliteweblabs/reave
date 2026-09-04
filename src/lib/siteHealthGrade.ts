/**
 * Sites fleet health grades — lightweight critical checks with a long SWR cache.
 *
 * Probes seo_inventory (schema, sitemap, internal links), Search Console coverage,
 * uptime, and Plausible wiring for dashboard tiles. PageSpeed and full link crawls
 * run on the Sites detail view only.
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
  gscListSitemaps,
  gscPropertyCandidates,
  type GscSiteEntry,
} from './googleSearchConsoleClient';
import { seoInventory, type SeoInventoryResponse } from './seoInventoryClient';
import { hostnameFromWebsite } from './plausibleClient';
import { isApexPublicWebsiteHost, normalizeMonitorHost } from './publicUrl';
import { buildSiteReadinessChecklist } from './siteReadinessChecklist';
import type {
  AnalyticsAccountRow,
  UptimeMonitorForFleetMerge,
} from './analyticsSiteMerge';
import {
  collectInstantSiteHealthIssues,
  scoreSiteHealthFromReadiness,
  type SiteHealthFleet,
  type SiteHealthSummary,
} from './siteHealthScore';
import { loadPersistedSiteHealthFleet, savePersistedSiteHealthFleet } from './siteHealthStore';
import {
  searchEnginesBlockedFromSeoProbe,
  siteUrlForIndexing,
} from './siteSearchIndexing';
import { callWpConnect, isWpConnectConfigured } from './wpConnectClient';

export type {
  SiteHealthFleet,
  SiteHealthIssue,
  SiteHealthIssueCode,
  SiteHealthSummary,
} from './siteHealthScore';
export {
  collectInstantSiteHealthIssues,
  scoreSiteHealthFromReadiness,
  scoreSiteHealthIssues,
} from './siteHealthScore';

export type SiteHealthCardInput = {
  siteId: string;
  website?: string | null;
  monitor?: UptimeMonitorForFleetMerge | null;
  analytics?: AnalyticsAccountRow | null;
};

const HEALTH_TTL_MS = 60 * 60_000;
const SEO_PROBE_CONCURRENCY = 3;

let healthCache: { at: number; fleet: SiteHealthFleet } | null = null;
let healthInflight: Promise<SiteHealthFleet> | null = null;
let healthHydratePromise: Promise<void> | null = null;

/** Drop in-memory grades after wiring or manual refresh (persisted copy kept until next scan). */
export function invalidateSiteHealthFleetCache(): void {
  healthCache = null;
}

/** Load last scan from Postgres / knowledge file into memory when empty. */
export async function hydrateSiteHealthFleetCache(): Promise<void> {
  if (healthCache) return;
  if (healthHydratePromise) {
    await healthHydratePromise;
    return;
  }
  healthHydratePromise = (async () => {
    try {
      const fleet = await loadPersistedSiteHealthFleet();
      if (fleet && !healthCache) {
        healthCache = { at: fleet.checkedAt, fleet };
      }
    } catch (e) {
      console.warn('[site-health] hydrate failed:', e instanceof Error ? e.message : e);
    } finally {
      healthHydratePromise = null;
    }
  })();
  await healthHydratePromise;
}

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

async function probeSeoInventory(
  siteId: string,
  website?: string | null,
): Promise<Extract<SeoInventoryResponse, { ok: true }> | null> {
  const host = hostnameFromWebsite(website || '') || normalizeMonitorHost(siteId) || siteId;
  if (!host) return null;
  const url = `https://${host.replace(/^www\./, '')}/`;
  const result = await seoInventory(url);
  return result.ok ? result : null;
}

async function probeWpConnectAvailable(siteId: string): Promise<boolean | null> {
  if (!isWpConnectConfigured()) return null;
  const siteUrl = siteUrlForIndexing(siteId);
  if (!siteUrl) return null;
  try {
    const ping = await callWpConnect(siteUrl, 'status');
    return ping.ok;
  } catch {
    return null;
  }
}

function gscPropertyUrl(entries: GscSiteEntry[] | null, siteId: string): string | null {
  if (!entries) return null;
  const candidates = new Set(gscPropertyCandidates(siteId).map((c) => c.toLowerCase()));
  const match = entries.find((e) => {
    const url = (e.siteUrl || '').trim().toLowerCase();
    return url && candidates.has(url);
  });
  return match?.siteUrl?.trim() || null;
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

    const seoResults = await mapPool(apexCards, SEO_PROBE_CONCURRENCY, (card) =>
      probeSeoInventory(card.siteId, card.website || card.analytics?.website),
    );
    const connectResults = await mapPool(apexCards, SEO_PROBE_CONCURRENCY, (card) => {
      const siteId =
        hostnameFromWebsite(card.siteId) || normalizeMonitorHost(card.siteId) || card.siteId;
      return probeWpConnectAvailable(siteId);
    });

    const gscSitemapCounts = new Map<string, number | null>();
    if (googleConnected && gscEntries) {
      await mapPool(apexCards, 2, async (card) => {
        const siteId =
          hostnameFromWebsite(card.siteId) || normalizeMonitorHost(card.siteId) || card.siteId;
        const propertyUrl = gscPropertyUrl(gscEntries, siteId);
        if (!propertyUrl) {
          gscSitemapCounts.set(siteId, null);
          return;
        }
        try {
          const sitemaps = await gscListSitemaps(propertyUrl, agencySubject());
          gscSitemapCounts.set(siteId, sitemaps.length);
        } catch {
          gscSitemapCounts.set(siteId, null);
        }
      });
    }

    const checkedAt = Date.now();
    const sites: Record<string, SiteHealthSummary> = {};
    for (let i = 0; i < apexCards.length; i++) {
      const card = apexCards[i]!;
      const siteId =
        hostnameFromWebsite(card.siteId) || normalizeMonitorHost(card.siteId) || card.siteId;
      const seo = seoResults[i] ?? null;
      const wpConnectAvailable = connectResults[i] ?? null;
      const searchEnginesBlocked = searchEnginesBlockedFromSeoProbe(seo);
      const robots = seo
        ? {
            present: seo.robots_txt.present,
            blocksAll: seo.robots_txt.blocks_all,
          }
        : null;
      const gscHasProperty = googleConnected ? gscHasApex(gscEntries, siteId) : null;
      const issues = collectInstantSiteHealthIssues({
        monitor: card.monitor,
        analytics: card.analytics,
        googleConnected,
        gscHasProperty,
        robots,
      });
      const readiness = buildSiteReadinessChecklist({
        seo,
        issues,
        googleConnected,
        gscHasProperty,
        gscSitemapCount: gscSitemapCounts.get(siteId) ?? null,
        analytics: card.analytics,
        monitor: card.monitor,
        checkedAt,
      });
      const scored = scoreSiteHealthFromReadiness(readiness);
      sites[siteId] = {
        grade: scored.grade,
        score: scored.score,
        criticalCount: scored.criticalCount,
        issues,
        readiness,
        checkedAt,
        searchEnginesBlocked,
        wpConnectAvailable,
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
    void savePersistedSiteHealthFleet(fleet).catch((e) => {
      console.warn('[site-health] persist failed:', e instanceof Error ? e.message : e);
    });
    return fleet;
  })();

  healthInflight = pending;
  try {
    return await pending;
  } finally {
    if (healthInflight === pending) healthInflight = null;
  }
}

