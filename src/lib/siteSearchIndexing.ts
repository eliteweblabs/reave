/**
 * Sites fleet — search engine indexing toggle (WordPress Connect + homepage probe).
 */
import { hostnameFromWebsite } from './plausibleClient';
import { seoInventory } from './seoInventoryClient';
import type { SiteHealthSummary } from './siteHealthScore';
import { callWpConnect, isWpConnectConfigured } from './wpConnectClient';

export type SiteSearchIndexingStatus = {
  siteId: string;
  blocked: boolean | null;
  connectAvailable: boolean;
  source: 'connect' | 'probe' | 'health' | 'unknown';
  detail: string;
};

export function normalizeSiteSearchIndexingSiteId(raw: string): string {
  return hostnameFromWebsite(raw) || String(raw || '').trim().toLowerCase().replace(/^www\./, '');
}

export function siteUrlForIndexing(siteId: string): string {
  const host = normalizeSiteSearchIndexingSiteId(siteId);
  return host ? `https://${host.replace(/^www\./, '')}` : '';
}

/** Derive blocked state from the last fleet health scan. */
export function inferSearchEnginesBlockedFromHealth(
  health: SiteHealthSummary | null | undefined,
): boolean | null {
  if (!health) return null;
  if (health.searchEnginesBlocked === true) return true;
  if (health.searchEnginesBlocked === false) return false;
  if (health.issues?.some((i) => i.code === 'robots_blocked')) return true;
  return null;
}

export function inferWpConnectAvailableFromHealth(
  health: SiteHealthSummary | null | undefined,
): boolean | null {
  if (!health) return null;
  if (health.wpConnectAvailable === true) return true;
  if (health.wpConnectAvailable === false) return false;
  return null;
}

export function searchEnginesBlockedFromSeoProbe(seo: {
  robots_txt?: { blocks_all?: boolean };
  page?: { meta_robots?: string | null };
} | null): boolean | null {
  if (!seo) return null;
  if (seo.robots_txt?.blocks_all) return true;
  const meta = String(seo.page?.meta_robots || '');
  if (/\bnoindex\b/i.test(meta)) return true;
  if (meta || seo.robots_txt) return false;
  return null;
}

async function connectIndexingStatus(siteUrl: string): Promise<SiteSearchIndexingStatus | null> {
  if (!isWpConnectConfigured()) return null;
  const ping = await callWpConnect(siteUrl, 'status');
  if (!ping.ok) return null;

  const idx = await callWpConnect(siteUrl, 'get_indexing_status');
  if (!idx.ok) {
    return {
      siteId: hostnameFromWebsite(siteUrl),
      blocked: null,
      connectAvailable: true,
      source: 'connect',
      detail: idx.error || 'Could not read indexing status',
    };
  }
  const body = idx.data as Record<string, unknown> | undefined;
  const blogPublic = Number(body?.blog_public);
  const blocked = blogPublic === 0;
  return {
    siteId: hostnameFromWebsite(siteUrl),
    blocked,
    connectAvailable: true,
    source: 'connect',
    detail:
      typeof body?.indexing === 'string'
        ? `WordPress: ${body.indexing}`
        : blocked
          ? 'WordPress: discouraging search engines'
          : 'WordPress: visible to search engines',
  };
}

/** Live status — Connect when available, otherwise homepage probe. */
export async function loadSiteSearchIndexingStatus(siteId: string): Promise<SiteSearchIndexingStatus> {
  const id = normalizeSiteSearchIndexingSiteId(siteId);
  const siteUrl = siteUrlForIndexing(id);
  if (!siteUrl) {
    return {
      siteId: id,
      blocked: null,
      connectAvailable: false,
      source: 'unknown',
      detail: 'Invalid site id',
    };
  }

  const fromConnect = await connectIndexingStatus(siteUrl);
  if (fromConnect) return { ...fromConnect, siteId: id };

  const seo = await seoInventory(`${siteUrl}/`);
  if (seo.ok) {
    const blocked = searchEnginesBlockedFromSeoProbe(seo);
    return {
      siteId: id,
      blocked,
      connectAvailable: false,
      source: 'probe',
      detail:
        blocked === true
          ? 'Homepage or robots.txt blocks crawlers (Connect not available)'
          : blocked === false
            ? 'Homepage allows indexing (Connect not available — toggle disabled)'
            : 'Could not determine indexing state',
    };
  }

  return {
    siteId: id,
    blocked: null,
    connectAvailable: false,
    source: 'unknown',
    detail: seo.error || 'Could not probe site',
  };
}

/** Toggle WordPress blog_public via Reave Connect. */
export async function setSiteSearchIndexingBlocked(
  siteId: string,
  blocked: boolean,
): Promise<{ ok: boolean; status?: SiteSearchIndexingStatus; error?: string }> {
  if (!isWpConnectConfigured()) {
    return { ok: false, error: 'REAVE_WP_API_KEY is not set' };
  }

  const siteUrl = siteUrlForIndexing(siteId);
  if (!siteUrl) return { ok: false, error: 'siteId is required' };

  const ping = await callWpConnect(siteUrl, 'status');
  if (!ping.ok) {
    return {
      ok: false,
      error: ping.error || 'Reave Connect is not installed or the API key does not match',
    };
  }

  const action = blocked ? 'disable_indexing' : 'enable_indexing';
  const out = await callWpConnect(siteUrl, action);
  if (!out.ok) {
    return { ok: false, error: out.error || `Connect ${action} failed` };
  }

  const status = await connectIndexingStatus(siteUrl);
  return {
    ok: true,
    status: status ?? {
      siteId: normalizeSiteSearchIndexingSiteId(siteId),
      blocked,
      connectAvailable: true,
      source: 'connect',
      detail: blocked ? 'Search engine indexing disabled' : 'Search engine indexing enabled',
    },
  };
}
