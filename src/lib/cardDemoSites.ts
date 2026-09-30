/**
 * /card “Local Demo Sites” — Railway *.up.railway.app previews with no live apex yet.
 */
import { isApexPublicWebsiteHost, isInternalInfraService, isNonProductionLabel } from './publicUrl';
import {
  isRailwayConfigured,
  railwayListProjectNetworking,
  railwayListProjects,
  type RailwayServiceNetworking,
} from './railwayClient';
import { isActiveRailwayProject } from './railwayProjectList';
import { decorateCardDemoSite } from './cardDemoSiteMeta';

export type CardDemoSite = {
  name: string;
  category: string;
  url: string;
  emoji: string;
};

const CARD_DEMO_CACHE_TTL_MS = 5 * 60_000;
const CARD_DEMO_STALE_MS = 24 * 60 * 60_000;
const CARD_DEMO_RAILWAY_CONCURRENCY = 8;

let cardDemoCache: { at: number; sites: CardDemoSite[] } | null = null;
let cardDemoRefresh: Promise<void> | null = null;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Ops / shared infra — not client preview sites on the NFC card. */
function isExcludedCardDemoProject(projectName: string): boolean {
  const n = projectName.trim().toLowerCase();
  if (!n) return true;
  if (n === 'rekko studio' || n === 'reave.app') return true;
  if (n === 'plausible analytics' || n === 'meet.reave.app') return true;
  if (n === 'omniroute' || n === 'pascal editor' || n === 'm-dot') return true;
  if (n === 'health' || n === 'icfp' || n === 'loveandever') return true;
  return false;
}

export function isRailwayPreviewHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h.endsWith('.up.railway.app') || h.endsWith('.railway.app');
}

function serviceHasLiveApexCustom(svc: RailwayServiceNetworking): boolean {
  return svc.custom_domains.some((d) => {
    const host = d.domain?.trim();
    return Boolean(host && isApexPublicWebsiteHost(host));
  });
}

function publicSiteServiceScore(serviceName: string): number {
  const n = serviceName.trim().toLowerCase();
  if (!n || isInternalInfraService(n) || isNonProductionLabel(n)) return -1;
  if (n.endsWith('-site') || n.endsWith('-web')) return 30;
  if (n === 'web' || n === 'website' || n === 'site' || n === 'frontend') return 25;
  if (n === 'reave' || n === 'astro') return 10;
  if (/-site-/.test(n)) return 20;
  return 1;
}

function pickRailwayPreviewUrl(svc: RailwayServiceNetworking): string | null {
  const hosts = svc.railway_domains
    .map((d) => d.domain?.trim())
    .filter((h): h is string => Boolean(h && isRailwayPreviewHost(h)));
  if (!hosts.length) return null;
  const preferred =
    hosts.find((h) => /-production(\.|$)/i.test(h)) ??
    hosts.find((h) => /-site-/i.test(h)) ??
    hosts[0];
  return preferred.startsWith('http') ? preferred : `https://${preferred}`;
}

function pickDemoService(services: RailwayServiceNetworking[]): RailwayServiceNetworking | null {
  let best: RailwayServiceNetworking | null = null;
  let bestScore = -1;
  for (const svc of services) {
    const score = publicSiteServiceScore(svc.service_name);
    if (score < 0) continue;
    if (serviceHasLiveApexCustom(svc)) continue;
    if (!pickRailwayPreviewUrl(svc)) continue;
    if (score > bestScore) {
      best = svc;
      bestScore = score;
    }
  }
  return best;
}

/**
 * All client installs still on Railway default URLs (no apex custom domain on the public service).
 */
async function collectCardDemoSitesFromRailway(): Promise<{ sites: CardDemoSite[]; warnings: string[] }> {
  const warnings: string[] = [];
  if (!isRailwayConfigured()) {
    return { sites: [], warnings: ['RAILWAY_API_TOKEN is not set'] };
  }

  const listed = await railwayListProjects();
  if (!listed.ok) {
    return { sites: [], warnings: [listed.error] };
  }

  const candidates = listed.projects.filter(
    (project) => isActiveRailwayProject(project) && !isExcludedCardDemoProject(project.name),
  );

  const rows = await mapWithConcurrency(candidates, CARD_DEMO_RAILWAY_CONCURRENCY, async (project) => {
    const net = await railwayListProjectNetworking({ project: project.id, environment: 'production' });
    if (!net.ok) {
      warnings.push(`${project.name}: ${net.error}`);
      return null;
    }

    const svc = pickDemoService(net.data.services);
    if (!svc) return null;

    const url = pickRailwayPreviewUrl(svc);
    if (!url) return null;

    return decorateCardDemoSite({
      name: project.name.trim(),
      category: 'Preview · Railway',
      url,
      emoji: '🌐',
    });
  });

  const sites: CardDemoSite[] = [];
  const seenUrls = new Set<string>();
  for (const row of rows) {
    if (!row || seenUrls.has(row.url)) continue;
    seenUrls.add(row.url);
    sites.push(row);
  }

  sites.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  cardDemoCache = { at: Date.now(), sites };
  return { sites, warnings };
}

export async function railwayCollectCardDemoSites(opts: {
  fresh?: boolean;
} = {}): Promise<{ sites: CardDemoSite[]; warnings: string[] }> {
  const now = Date.now();
  if (!opts.fresh && cardDemoCache && now - cardDemoCache.at < CARD_DEMO_CACHE_TTL_MS) {
    return { sites: cardDemoCache.sites, warnings: [] };
  }

  return collectCardDemoSitesFromRailway();
}

/** Warm cache without blocking the caller (e.g. after serving stale demo sites). */
export function refreshCardDemoSitesInBackground(): void {
  if (cardDemoRefresh) return;
  cardDemoRefresh = collectCardDemoSitesFromRailway()
    .catch(() => undefined)
    .finally(() => {
      cardDemoRefresh = null;
    });
}

/** Static fallback when the token is missing (local dev). */
export const CARD_DEMO_SITES_FALLBACK: CardDemoSite[] = [
  {
    name: 'Karla Cassidy Designs',
    category: 'Wedding Florist · Beverly, MA',
    url: 'https://karlacassidy-site-production.up.railway.app',
    emoji: '💐',
  },
  {
    name: 'Standley Bros. Machine Co.',
    category: 'Machine Shop · Beverly, MA',
    url: 'https://web-production-99fb9c.up.railway.app',
    emoji: '⚙️',
  },
  {
    name: 'Maddy the Barber',
    category: 'Barber · Beverly, MA',
    url: 'https://maddythebarber-site-production.up.railway.app',
    emoji: '💈',
  },
  {
    name: 'JC Pena',
    category: 'Master Barber',
    url: 'https://jcpena-site-production.up.railway.app',
    emoji: '🪒',
  },
  {
    name: 'Lux Cleaning',
    category: 'Cleaning Service · Beverly, MA',
    url: 'https://lux-cleaning-production.up.railway.app',
    emoji: '✨',
  },
];

export async function resolveCardDemoSites(): Promise<CardDemoSite[]> {
  const now = Date.now();
  const stale =
    cardDemoCache && now - cardDemoCache.at < CARD_DEMO_STALE_MS ? cardDemoCache.sites : null;

  if (cardDemoCache && now - cardDemoCache.at < CARD_DEMO_CACHE_TTL_MS) {
    return cardDemoCache.sites.length ? cardDemoCache.sites : CARD_DEMO_SITES_FALLBACK;
  }

  if (stale?.length) {
    refreshCardDemoSitesInBackground();
    return stale;
  }

  const { sites } = await railwayCollectCardDemoSites();
  return sites.length ? sites : CARD_DEMO_SITES_FALLBACK;
}

export function normalizeCardDemoUrl(u: string): string {
  return u.trim().toLowerCase().replace(/\/+$/, '');
}

export function synthesizeCardDemoSiteFromUrl(demoUrl: string): CardDemoSite {
  const urlObj = new URL(demoUrl);
  const hostLabel = urlObj.hostname.replace(/\.up\.railway\.app$/i, '').replace(/-/g, ' ');
  return decorateCardDemoSite({
    name: hostLabel || 'Demo Site',
    category: 'Preview · Railway',
    url: demoUrl,
    emoji: '🌐',
  });
}

export function visibleCardDemoSites(
  allDemoSites: CardDemoSite[],
  demoUrl: string,
): { sites: CardDemoSite[]; single: boolean } {
  if (!demoUrl) {
    return { sites: allDemoSites, single: false };
  }
  const needle = normalizeCardDemoUrl(demoUrl);
  const matched = allDemoSites.filter((s) => normalizeCardDemoUrl(s.url) === needle);
  if (matched.length) {
    return { sites: matched, single: true };
  }
  return { sites: [synthesizeCardDemoSiteFromUrl(demoUrl)], single: true };
}

export function parseCardDemoParam(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href;
    }
  } catch {
    /* invalid */
  }
  return '';
}

export async function resolveVisibleCardDemoSites(demoUrl: string): Promise<{
  sites: CardDemoSite[];
  single: boolean;
}> {
  const all = (await resolveCardDemoSites()).map(decorateCardDemoSite);
  return visibleCardDemoSites(all, demoUrl);
}
