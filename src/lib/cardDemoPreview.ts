import * as cheerio from 'cheerio';
import { isRailwayPreviewHost, normalizeCardDemoUrl } from './cardDemoSites';
import { isApexPublicWebsiteHost } from './publicUrl';

const PREVIEW_CACHE_TTL_MS = 6 * 60 * 60_000;

type PreviewCacheRow = { at: number; url: string | null };

const previewCache = new Map<string, PreviewCacheRow>();

function extractMeta($: cheerio.CheerioAPI, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const el =
    $(`meta[property="${key}"]`).attr('content') ||
    $(`meta[name="${key}"]`).attr('content') ||
    $(`meta[property="${escaped}"]`).attr('content');
  return (el ?? '').trim();
}

function resolveAbsoluteUrl(raw: string, pageUrl: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed, pageUrl).href;
  } catch {
    return null;
  }
}

export function isAllowedCardDemoPreviewTarget(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return isRailwayPreviewHost(host) || isApexPublicWebsiteHost(host);
  } catch {
    return false;
  }
}

export async function fetchCardDemoOgImage(pageUrl: string): Promise<string | null> {
  if (!isAllowedCardDemoPreviewTarget(pageUrl)) return null;

  const cacheKey = normalizeCardDemoUrl(pageUrl);
  const hit = previewCache.get(cacheKey);
  if (hit && Date.now() - hit.at < PREVIEW_CACHE_TTL_MS) {
    return hit.url;
  }

  let resolved: string | null = null;
  try {
    const res = await fetch(pageUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'ReaveCardDemo/1.0 (+https://rekko.studio/card)',
      },
    });
    if (!res.ok) {
      previewCache.set(cacheKey, { at: Date.now(), url: null });
      return null;
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    const og =
      extractMeta($, 'og:image') ||
      extractMeta($, 'og:image:url') ||
      extractMeta($, 'twitter:image') ||
      extractMeta($, 'twitter:image:src');
    resolved = resolveAbsoluteUrl(og, res.url || pageUrl);
    if (resolved && !/^https:/i.test(resolved)) {
      resolved = null;
    }
  } catch {
    resolved = null;
  }

  previewCache.set(cacheKey, { at: Date.now(), url: resolved });
  return resolved;
}
