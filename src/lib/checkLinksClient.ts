/**
 * Crawl a page and check links for broken URLs, redirects, and empty anchors.
 */
import * as cheerio from 'cheerio';
import { normalizePublicUrl } from './publicUrl';

const USER_AGENT =
  'Mozilla/5.0 (compatible; SiteAuditBot/1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const PAGE_TIMEOUT_MS = 15_000;
const LINK_TIMEOUT_MS = 5_000;
const MAX_HTML_BYTES = 2_000_000;
const MAX_UNIQUE_LINKS = 150;
const MAX_INTERNAL_PAGES = 20;
const MAX_REDIRECT_HOPS = 8;
const EXTERNAL_CONCURRENCY = 2;
const INTERNAL_CONCURRENCY = 4;

export type LinkProbeResult = {
  url: string;
  anchor_text: string;
  source_page: string;
  internal: boolean;
  status: number | 'timeout' | 'error';
  final_url?: string;
  redirect_chain?: string[];
  error?: string;
};

export type CheckLinksResponse =
  | {
      ok: true;
      start_url: string;
      pages_crawled: number;
      summary: {
        total_links: number;
        internal: number;
        external: number;
        broken: number;
        redirects: number;
        empty_anchors: number;
      };
      broken: LinkProbeResult[];
      redirects: LinkProbeResult[];
      empty_anchors: { source_page: string; anchor_text: string; href: string }[];
    }
  | { ok: false; error: string };

type ParsedLink = {
  href: string;
  anchor_text: string;
  source_page: string;
  internal: boolean;
  resolved: string;
};

function isInternal(resolved: URL, origin: URL): boolean {
  return resolved.hostname === origin.hostname;
}

function resolveHref(href: string, base: URL): URL | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:') || trimmed.startsWith('javascript:')) {
    return null;
  }
  try {
    const u = new URL(trimmed, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

async function fetchPageHtml(pageUrl: URL): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(pageUrl.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,*/*',
      },
    });
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES) {
      throw new Error(`Page too large (${Math.round(buf.byteLength / 1024)}KB)`);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching page`);
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(buf);
  } finally {
    clearTimeout(timer);
  }
}

function extractLinks(
  html: string,
  pageUrl: URL,
  origin: URL,
): { links: ParsedLink[]; empty: { source_page: string; anchor_text: string; href: string }[] } {
  const $ = cheerio.load(html);
  const links: ParsedLink[] = [];
  const empty: { source_page: string; anchor_text: string; href: string }[] = [];
  const seenOnPage = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') ?? '').trim();
    const anchor_text = $(el).text().replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!href) {
      empty.push({ source_page: pageUrl.toString(), anchor_text: anchor_text || '(empty)', href: '' });
      return;
    }
    if (href === '#' || href.startsWith('javascript:')) {
      empty.push({ source_page: pageUrl.toString(), anchor_text: anchor_text || '(empty)', href });
      return;
    }
    const resolved = resolveHref(href, pageUrl);
    if (!resolved) return;
    const key = resolved.toString();
    if (seenOnPage.has(key)) return;
    seenOnPage.add(key);
    links.push({
      href,
      anchor_text: anchor_text || '(no text)',
      source_page: pageUrl.toString(),
      internal: isInternal(resolved, origin),
      resolved: key,
    });
  });

  return { links, empty };
}

async function probeLink(link: ParsedLink): Promise<LinkProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LINK_TIMEOUT_MS);
  const chain: string[] = [link.resolved];
  let current = link.resolved;

  try {
    for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
      let res = await fetch(current, {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
      });

      if (res.status === 405 || res.status === 501) {
        res = await fetch(current, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
        });
      }

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) {
          return {
            url: link.resolved,
            anchor_text: link.anchor_text,
            source_page: link.source_page,
            internal: link.internal,
            status: res.status,
            final_url: current,
            redirect_chain: chain,
          };
        }
        const next = new URL(loc, current).toString();
        if (chain.includes(next)) break;
        chain.push(next);
        current = next;
        continue;
      }

      return {
        url: link.resolved,
        anchor_text: link.anchor_text,
        source_page: link.source_page,
        internal: link.internal,
        status: res.status,
        final_url: current !== link.resolved ? current : undefined,
        redirect_chain: chain.length > 1 ? chain : undefined,
      };
    }

    return {
      url: link.resolved,
      anchor_text: link.anchor_text,
      source_page: link.source_page,
      internal: link.internal,
      status: 'error',
      redirect_chain: chain,
      error: 'Redirect loop or too many hops',
    };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return {
        url: link.resolved,
        anchor_text: link.anchor_text,
        source_page: link.source_page,
        internal: link.internal,
        status: 'timeout',
      };
    }
    return {
      url: link.resolved,
      anchor_text: link.anchor_text,
      source_page: link.source_page,
      internal: link.internal,
      status: 'error',
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function isBroken(r: LinkProbeResult): boolean {
  const status = r.status;
  return status === 'timeout' || status === 'error' || status === 404 || (typeof status === 'number' && status >= 500);
}

function isRedirect(r: LinkProbeResult): boolean {
  return Boolean(r.redirect_chain && r.redirect_chain.length > 1) ||
    (typeof r.status === 'number' && r.status >= 300 && r.status < 400);
}

export async function checkLinks(
  urlInput: string,
  followInternal = false,
): Promise<CheckLinksResponse> {
  const start = normalizePublicUrl(urlInput, true);
  if (!start) {
    return { ok: false, error: 'Invalid or blocked URL (http/https only; no localhost/private IPs)' };
  }

  const pagesToFetch = [start.toString()];
  const fetchedPages = new Set<string>();
  const allLinks: ParsedLink[] = [];
  const allEmpty: { source_page: string; anchor_text: string; href: string }[] = [];

  while (pagesToFetch.length && fetchedPages.size < (followInternal ? MAX_INTERNAL_PAGES : 1)) {
    const page = pagesToFetch.shift()!;
    if (fetchedPages.has(page)) continue;
    fetchedPages.add(page);

    let html: string;
    try {
      html = await fetchPageHtml(new URL(page));
    } catch (e) {
      if (fetchedPages.size === 1) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      continue;
    }

    const { links, empty } = extractLinks(html, new URL(page), start);
    allLinks.push(...links);
    allEmpty.push(...empty);

    if (followInternal) {
      for (const l of links) {
        if (l.internal && !fetchedPages.has(l.resolved) && !pagesToFetch.includes(l.resolved)) {
          pagesToFetch.push(l.resolved);
        }
      }
    }
  }

  const unique = new Map<string, ParsedLink>();
  for (const l of allLinks) {
    if (!unique.has(l.resolved)) unique.set(l.resolved, l);
    if (unique.size >= MAX_UNIQUE_LINKS) break;
  }

  const linkList = [...unique.values()];
  const external = linkList.filter((l) => !l.internal);
  const internal = linkList.filter((l) => l.internal);

  const externalResults = external.length
    ? await mapPool(external, EXTERNAL_CONCURRENCY, probeLink)
    : [];
  const internalResults = internal.length
    ? await mapPool(internal, INTERNAL_CONCURRENCY, probeLink)
    : [];

  const probed = [...externalResults, ...internalResults];
  const broken = probed.filter(isBroken);
  const redirects = probed.filter(isRedirect);

  return {
    ok: true,
    start_url: start.toString(),
    pages_crawled: fetchedPages.size,
    summary: {
      total_links: linkList.length,
      internal: internal.length,
      external: external.length,
      broken: broken.length,
      redirects: redirects.length,
      empty_anchors: allEmpty.length,
    },
    broken: broken.slice(0, 40),
    redirects: redirects.slice(0, 30),
    empty_anchors: allEmpty.slice(0, 20),
  };
}

export function formatCheckLinksResults(result: Extract<CheckLinksResponse, { ok: true }>): string {
  const s = result.summary;
  const lines = [
    `Link check — ${result.start_url}`,
    `Pages crawled: ${result.pages_crawled}`,
    `Links: ${s.total_links} total (${s.internal} internal, ${s.external} external)`,
    `Broken: ${s.broken} · Redirects: ${s.redirects} · Empty anchors: ${s.empty_anchors}`,
  ];
  if (result.broken.length) {
    lines.push('', 'Broken links:');
    for (const b of result.broken.slice(0, 10)) {
      lines.push(`• [${b.status}] ${b.anchor_text} → ${b.url}`);
    }
  }
  if (result.redirects.length) {
    lines.push('', 'Redirects:');
    for (const r of result.redirects.slice(0, 5)) {
      lines.push(`• ${r.url} → ${r.final_url ?? r.redirect_chain?.at(-1)}`);
    }
  }
  return lines.join('\n');
}
