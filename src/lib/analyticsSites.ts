/**
 * Analytics fleet = Railway + Kinsta websites with an apex domain.
 * Not contacts — contacts may link to a site, but discovery is host platforms only.
 */
import { hostnameFromWebsite, plausibleSiteId } from './plausibleClient';
import { isApexPublicWebsiteHost } from './publicUrl';
import { isKinstaConfigured, kinstaCollectMonitorUrls } from './kinstaClient';
import { isRailwayConfigured, railwayCollectMonitorUrls } from './railwayClient';
import { mergeAnalyticsSites, type AnalyticsSiteOption } from './analyticsSiteMerge';

export type { AnalyticsSiteKind, AnalyticsSiteOption } from './analyticsSiteMerge';
export { mergeAnalyticsSites } from './analyticsSiteMerge';

const HOSTED_SITES_TTL_MS = 5 * 60_000;

let hostedSitesCache: {
  at: number;
  sites: AnalyticsSiteOption[];
  warnings: string[];
} | null = null;

function mapHostedUrls(
  urls: Array<{ url: string; friendlyName: string }>,
  kind: 'railway' | 'kinsta',
): AnalyticsSiteOption[] {
  return mergeAnalyticsSites(
    urls.map((item) => {
      const siteId = hostnameFromWebsite(item.url);
      if (!siteId || !isApexPublicWebsiteHost(siteId)) return null;
      return {
        siteId,
        label: siteId,
        kind,
        website: item.url.startsWith('http') ? item.url : `https://${siteId}`,
        sourceLabel: item.friendlyName,
      };
    }),
  );
}

export async function listRailwayAnalyticsSites(opts: {
  fresh?: boolean;
} = {}): Promise<{ sites: AnalyticsSiteOption[]; warnings: string[] }> {
  const all = await listHostedAnalyticsSites(opts);
  return {
    sites: all.sites.filter((s) => s.kind === 'railway'),
    warnings: all.warnings,
  };
}

/** Apex custom domains on Railway + Kinsta — the Analytics fleet source of truth. */
export async function listHostedAnalyticsSites(opts: {
  fresh?: boolean;
} = {}): Promise<{ sites: AnalyticsSiteOption[]; warnings: string[] }> {
  if (!opts.fresh && hostedSitesCache && Date.now() - hostedSitesCache.at < HOSTED_SITES_TTL_MS) {
    return { sites: hostedSitesCache.sites, warnings: hostedSitesCache.warnings };
  }

  const warnings: string[] = [];
  const parts: AnalyticsSiteOption[] = [];

  if (isRailwayConfigured()) {
    const collected = await railwayCollectMonitorUrls();
    if (!collected.ok) {
      warnings.push(collected.error);
    } else {
      warnings.push(...collected.warnings);
      parts.push(...mapHostedUrls(collected.urls, 'railway'));
    }
  }

  if (isKinstaConfigured()) {
    const collected = await kinstaCollectMonitorUrls();
    if (!collected.ok) {
      warnings.push(collected.error);
    } else {
      parts.push(...mapHostedUrls(collected.urls, 'kinsta'));
    }
  }

  const sites = mergeAnalyticsSites(parts);
  hostedSitesCache = { at: Date.now(), sites, warnings };
  return { sites, warnings };
}

export async function listAnalyticsSites(
  companyDomain: string,
  opts: { includeHosted?: boolean; freshHosted?: boolean } = {},
): Promise<AnalyticsSiteOption[]> {
  const includeHosted = opts.includeHosted !== false;
  const agencyHost =
    hostnameFromWebsite(companyDomain) || hostnameFromWebsite(plausibleSiteId(companyDomain));
  const agency: AnalyticsSiteOption | null =
    agencyHost && isApexPublicWebsiteHost(agencyHost)
      ? {
          siteId: agencyHost,
          label: agencyHost,
          kind: 'agency',
          website: `https://${agencyHost}`,
        }
      : null;

  if (!includeHosted) {
    return mergeAnalyticsSites([agency]);
  }

  const hosted = await listHostedAnalyticsSites({ fresh: opts.freshHosted });
  return mergeAnalyticsSites([agency, ...hosted.sites]);
}
