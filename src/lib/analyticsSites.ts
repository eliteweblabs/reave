/**
 * Agency, client, and live Railway websites that can appear in Analytics.
 */
import {
  attachPortalLinksForList,
  contactIsPersonal,
  extractPortal,
  isContactApiConfigured,
  listContacts,
} from './contactApi';
import {
  hostnameFromWebsite,
  isPlausibleSitesApiUnavailableError,
  plausibleListSites,
  plausibleSiteId,
} from './plausibleClient';
import { isPublicWebsiteHost } from './publicUrl';
import { isRailwayConfigured, railwayCollectMonitorUrls } from './railwayClient';
import { mergeAnalyticsSites, type AnalyticsSiteOption } from './analyticsSiteMerge';

export type { AnalyticsSiteKind, AnalyticsSiteOption } from './analyticsSiteMerge';
export { mergeAnalyticsSites } from './analyticsSiteMerge';

const RAILWAY_SITES_TTL_MS = 5 * 60_000;

let railwaySitesCache: {
  at: number;
  sites: AnalyticsSiteOption[];
  warnings: string[];
} | null = null;

export async function listRailwayAnalyticsSites(opts: {
  fresh?: boolean;
} = {}): Promise<{ sites: AnalyticsSiteOption[]; warnings: string[] }> {
  if (!opts.fresh && railwaySitesCache && Date.now() - railwaySitesCache.at < RAILWAY_SITES_TTL_MS) {
    return { sites: railwaySitesCache.sites, warnings: railwaySitesCache.warnings };
  }
  if (!isRailwayConfigured()) {
    return { sites: [], warnings: [] };
  }

  const collected = await railwayCollectMonitorUrls();
  if (!collected.ok) {
    return { sites: [], warnings: [collected.error] };
  }

  const sites = mergeAnalyticsSites(
    collected.urls.map((item) => {
      const siteId = hostnameFromWebsite(item.url);
      if (!siteId || !isPublicWebsiteHost(siteId)) return null;
      return {
        siteId,
        label: siteId,
        kind: 'railway' as const,
        website: item.url,
        sourceLabel: item.friendlyName,
      };
    }),
  );
  railwaySitesCache = { at: Date.now(), sites, warnings: collected.warnings };
  return { sites, warnings: collected.warnings };
}

async function listContactAnalyticsSites(): Promise<AnalyticsSiteOption[]> {
  if (!isContactApiConfigured()) return [];
  const listed = await listContacts({ limit: 100 });
  if (!listed.ok) return [];

  const contacts = await attachPortalLinksForList(
    listed.data.contacts.filter((c) => !c.archived),
  );
  const out: AnalyticsSiteOption[] = [];
  for (const contact of contacts) {
    if (contactIsPersonal(contact)) continue;
    const portal = extractPortal(contact);
    const website = (portal?.website || '').trim();
    const siteId = hostnameFromWebsite(website);
    if (!siteId || !isPublicWebsiteHost(siteId)) continue;
    out.push({
      siteId,
      label: (contact.company || contact.name || siteId).trim(),
      kind: 'client',
      contactUid: contact.uid,
      website,
    });
  }
  return out;
}

let sitesApiKnownMissing = false;

async function listPlausibleRegisteredSites(): Promise<AnalyticsSiteOption[]> {
  if (sitesApiKnownMissing) return [];
  const listed = await plausibleListSites();
  if (!listed.ok) {
    if (isPlausibleSitesApiUnavailableError(listed.error)) sitesApiKnownMissing = true;
    return [];
  }
  return listed.data.sites
    .filter((row) => isPublicWebsiteHost(row.domain))
    .map((row) => ({
      siteId: row.domain,
      label: row.domain,
      kind: 'railway' as const,
      website: `https://${row.domain}`,
      sourceLabel: 'Plausible',
    }));
}

export async function listAnalyticsSites(
  companyDomain: string,
  opts: { includeRailway?: boolean; freshRailway?: boolean } = {},
): Promise<AnalyticsSiteOption[]> {
  const includeRailway = opts.includeRailway !== false;
  const agencyHost =
    hostnameFromWebsite(companyDomain) || hostnameFromWebsite(plausibleSiteId(companyDomain));
  const agency: AnalyticsSiteOption | null = agencyHost
    ? {
        siteId: agencyHost,
        label: agencyHost,
        kind: 'agency',
        website: `https://${agencyHost}`,
      }
    : null;

  const [contacts, railway, registered] = await Promise.all([
    listContactAnalyticsSites(),
    includeRailway
      ? listRailwayAnalyticsSites({ fresh: opts.freshRailway })
      : Promise.resolve({ sites: [], warnings: [] }),
    includeRailway ? listPlausibleRegisteredSites() : Promise.resolve([]),
  ]);

  return mergeAnalyticsSites([agency, ...contacts, ...railway.sites, ...registered]);
}
