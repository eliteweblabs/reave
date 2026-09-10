/**
 * Shared 24h PageSpeed cache for fleet scans and per-site readiness detail.
 */
import { lighthousePsiMobile } from './lighthouseClient';
import type { PageSpeedProbe } from './siteReadinessChecklist';

const PSI_CACHE_TTL_MS = 24 * 60 * 60_000;

const psiCache = new Map<string, { at: number; probe: PageSpeedProbe }>();

function cacheKey(url: string): string {
  return url.replace(/\/+$/, '').toLowerCase();
}

export function pageSpeedProbeFromPsi(url: string, fresh: boolean): Promise<PageSpeedProbe | null> {
  const key = cacheKey(url);
  const cached = psiCache.get(key);
  if (!fresh && cached && Date.now() - cached.at < PSI_CACHE_TTL_MS) {
    return Promise.resolve(cached.probe);
  }

  return (async (): Promise<PageSpeedProbe | null> => {
    const res = await lighthousePsiMobile(url);
    if (!res.ok) {
      const probe: PageSpeedProbe = {
        performanceScore: null,
        fieldCategory: null,
        detail: res.error,
      };
      psiCache.set(key, { at: Date.now(), probe });
      console.warn('[pagespeed] PSI failed', { url, error: res.error.slice(0, 160) });
      return probe;
    }
    const score = res.scores.performance != null ? Math.round(res.scores.performance * 100) : null;
    const field = res.pageExperience?.overall || res.originExperience?.overall || null;
    const detailParts: string[] = [];
    if (field) detailParts.push(`Field data: ${field}`);
    if (score != null) detailParts.push(`Lab mobile score ${score}`);
    if (res.metrics.lcp) detailParts.push(`LCP ${res.metrics.lcp}`);
    const probe: PageSpeedProbe = {
      performanceScore: score,
      fieldCategory: field,
      detail: detailParts.join(' · ') || 'PageSpeed scan complete',
    };
    psiCache.set(key, { at: Date.now(), probe });
    return probe;
  })();
}

export async function warmFleetPageSpeedCache(
  urls: string[],
  opts: { fresh?: boolean; concurrency?: number } = {},
): Promise<number> {
  const fresh = opts.fresh === true;
  const concurrency = Math.max(1, opts.concurrency ?? 1);
  let warmed = 0;
  let idx = 0;
  async function worker() {
    while (idx < urls.length) {
      const i = idx++;
      const probe = await pageSpeedProbeFromUrl(urls[i]!, fresh);
      if (probe) warmed += 1;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()));
  return warmed;
}

export async function pageSpeedProbeFromUrl(siteUrl: string, fresh = false): Promise<PageSpeedProbe | null> {
  const normalized = siteUrl.includes('://') ? siteUrl : `https://${siteUrl.replace(/^www\./, '')}/`;
  return pageSpeedProbeFromPsi(normalized, fresh);
}

export function peekCachedPageSpeedProbe(siteUrl: string): PageSpeedProbe | null {
  const normalized = siteUrl.includes('://') ? siteUrl : `https://${siteUrl.replace(/^www\./, '')}/`;
  const cached = psiCache.get(cacheKey(normalized));
  if (!cached || Date.now() - cached.at >= PSI_CACHE_TTL_MS) return null;
  return cached.probe;
}
