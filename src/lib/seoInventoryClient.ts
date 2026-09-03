/**
 * On-page SEO / share / crawl inventory for sales-ready audits.
 *
 * Checks the homepage for classic "you're missing X → losing Y" assets:
 * Open Graph / Twitter cards, robots.txt, sitemap, web manifest, favicon,
 * canonical, meta robots, and JSON-LD structured data.
 */
import * as cheerio from 'cheerio';
import { normalizePublicUrl } from './publicUrl';

const USER_AGENT =
  'Mozilla/5.0 (compatible; SiteAuditBot/1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 1_500_000;

export type SeoInventoryItemStatus = 'ok' | 'warn' | 'missing' | 'error';

export type SeoInventoryItem = {
  id: string;
  label: string;
  status: SeoInventoryItemStatus;
  detail: string;
  /** Plain-language sales pitch: what's wrong. */
  problem?: string;
  /** Plain-language sales pitch: why it hurts. */
  impact?: string;
};

export type SeoInventoryResponse =
  | {
      ok: true;
      url: string;
      final_url: string;
      grade: 'A' | 'B' | 'C' | 'D' | 'F';
      score: number;
      items: SeoInventoryItem[];
      issues: string[];
      /** Pitch-ready Problem → Impact lines for the audit body / report card. */
      pitches: { problem: string; impact: string }[];
      open_graph: {
        title: string;
        description: string;
        image: string;
        url: string;
        type: string;
      };
      twitter: {
        card: string;
        title: string;
        description: string;
        image: string;
      };
      page: {
        title: string;
        meta_description: string;
        canonical: string;
        meta_robots: string;
      };
      favicon: { present: boolean; href: string; apple_touch: boolean };
      manifest: { present: boolean; href: string; name: string; valid: boolean };
      robots_txt: {
        present: boolean;
        url: string;
        blocks_all: boolean;
        sitemap_refs: string[];
        sample: string;
      };
      sitemap: {
        present: boolean;
        url: string;
        url_count_estimate: number | null;
        status_code: number | null;
      };
      structured_data: {
        present: boolean;
        types: string[];
        count: number;
      };
      internal_links: {
        total: number;
        serviceLike: number;
        samplePaths: string[];
      };
    }
  | { ok: false; error: string };

function extractMeta($: cheerio.CheerioAPI, key: string): string {
  const byName = $(`meta[name="${key}"]`).attr('content');
  if (byName?.trim()) return byName.trim();
  const byProp = $(`meta[property="${key}"]`).attr('content');
  if (byProp?.trim()) return byProp.trim();
  const byItem = $(`meta[itemprop="${key}"]`).attr('content');
  return byItem?.trim() ?? '';
}

async function fetchText(
  url: URL,
  accept: string,
): Promise<{ ok: boolean; status: number; text: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: accept,
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return {
        ok: false,
        status: res.status,
        text: '',
        finalUrl: res.url || url.toString(),
      };
    }
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    return {
      ok: res.ok,
      status: res.status,
      text,
      finalUrl: res.url || url.toString(),
    };
  } catch {
    return { ok: false, status: 0, text: '', finalUrl: url.toString() };
  } finally {
    clearTimeout(timer);
  }
}

function resolveHref(base: URL, href: string | undefined): string {
  if (!href?.trim()) return '';
  try {
    return new URL(href.trim(), base).toString();
  } catch {
    return href.trim();
  }
}

function looksLikeImageUrl(href: string): boolean {
  if (!href) return false;
  if (/^data:image\//i.test(href)) return true;
  return /\.(png|jpe?g|webp|gif|svg|avif)(\?|#|$)/i.test(href) || /\/image|og[-_]?img|social|share/i.test(href);
}

function parseJsonLdTypes(html: string): string[] {
  const $ = cheerio.load(html);
  const types = new Set<string>();
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html()?.trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      collectTypes(parsed, types);
    } catch {
      // Some sites emit multiple JSON objects; try wrapping / splitting lightly.
      try {
        const wrapped = JSON.parse(`[${raw.replace(/}\s*{/g, '},{')}]`) as unknown;
        collectTypes(wrapped, types);
      } catch {
        /* ignore invalid JSON-LD */
      }
    }
  });
  return [...types].sort((a, b) => a.localeCompare(b));
}

function collectTypes(node: unknown, out: Set<string>, depth = 0): void {
  if (node == null || depth > 8) return;
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, out, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  const t = obj['@type'];
  if (typeof t === 'string' && t.trim()) out.add(t.trim());
  else if (Array.isArray(t)) {
    for (const item of t) {
      if (typeof item === 'string' && item.trim()) out.add(item.trim());
    }
  }
  if (obj['@graph']) collectTypes(obj['@graph'], out, depth + 1);
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') collectTypes(value, out, depth + 1);
  }
}

function estimateSitemapUrls(body: string): number | null {
  const locMatches = body.match(/<loc\b/gi);
  if (locMatches?.length) return locMatches.length;
  // Sitemap index
  const sitemapMatches = body.match(/<sitemap\b/gi);
  if (sitemapMatches?.length) return sitemapMatches.length;
  return null;
}

const SERVICE_PATH_RE =
  /\/(services?|service-area|locations?|areas?|treatments?|specialt(y|ies)|practice-areas?|our-work|portfolio|menu|pricing|about|contact|team|staff|departments?|programs?|classes|courses?|products?|shop|solutions?|industries|capabilities|expertise|what-we-do|offerings?)(\/|$)/i;

function countHomepageInternalLinks(
  $: cheerio.CheerioAPI,
  finalUrl: URL,
): { total: number; serviceLike: number; samplePaths: string[] } {
  const seen = new Set<string>();
  const samplePaths: string[] = [];
  let serviceLike = 0;
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    let resolved: URL;
    try {
      resolved = new URL(href, finalUrl);
    } catch {
      return;
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return;
    if (resolved.hostname.replace(/^www\./, '') !== finalUrl.hostname.replace(/^www\./, '')) return;
    const path = resolved.pathname.replace(/\/+$/, '') || '/';
    if (seen.has(path)) return;
    seen.add(path);
    if (SERVICE_PATH_RE.test(path) || (path !== '/' && path.split('/').filter(Boolean).length >= 2)) {
      serviceLike += 1;
      if (samplePaths.length < 5) samplePaths.push(path);
    }
  });
  return { total: seen.size, serviceLike, samplePaths };
}

/** True when User-agent: * (or empty) has Disallow: / or /*. */
export function robotsTxtBlocksAll(body: string): boolean {
  const blocks: string[] = [];
  let currentUa = '';
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const ua = line.match(/^user-agent:\s*(.+)$/i);
    if (ua) {
      currentUa = ua[1].trim();
      continue;
    }
    const dis = line.match(/^disallow:\s*(.*)$/i);
    if (dis && (currentUa === '*' || currentUa === '')) {
      blocks.push(dis[1].trim());
    }
  }
  return blocks.some((d) => d === '/' || d === '/*');
}

function robotsBlocksAll(body: string): boolean {
  return robotsTxtBlocksAll(body);
}

function extractSitemapRefs(body: string): string[] {
  const refs: string[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const m = rawLine.match(/^sitemap:\s*(\S+)/i);
    if (m?.[1]) refs.push(m[1].trim());
  }
  return [...new Set(refs)];
}

function computeGrade(items: SeoInventoryItem[]): {
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  score: number;
} {
  // Weight the sales-critical assets higher.
  const weights: Record<string, number> = {
    title: 8,
    meta_description: 10,
    canonical: 6,
    meta_robots: 10,
    og_image: 14,
    og_title: 4,
    og_description: 4,
    twitter_card: 6,
    favicon: 6,
    apple_touch_icon: 3,
    manifest: 5,
    robots_txt: 10,
    sitemap: 10,
    structured_data: 10,
  };
  let earned = 0;
  let possible = 0;
  for (const item of items) {
    const w = weights[item.id] ?? 5;
    possible += w;
    if (item.status === 'ok') earned += w;
    else if (item.status === 'warn') earned += w * 0.45;
    // missing / error → 0
  }
  const score = possible > 0 ? Math.round((earned / possible) * 100) : 0;
  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 65) grade = 'C';
  else if (score >= 50) grade = 'D';
  else grade = 'F';
  return { grade, score };
}

/** Run the SEO / share / crawl inventory against a public URL. */
export async function seoInventory(urlInput: string): Promise<SeoInventoryResponse> {
  const startUrl = normalizePublicUrl(urlInput, true);
  if (!startUrl) {
    return { ok: false, error: 'Invalid or blocked URL (http/https only; no localhost/private IPs)' };
  }

  const pageFetch = await fetchText(startUrl, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8');
  if (!pageFetch.text.trim() && !pageFetch.ok) {
    return {
      ok: false,
      error: pageFetch.status
        ? `HTTP ${pageFetch.status} — could not fetch page HTML`
        : 'Could not fetch page HTML',
    };
  }

  let finalUrl: URL;
  try {
    finalUrl = new URL(pageFetch.finalUrl);
  } catch {
    finalUrl = startUrl;
  }

  const $ = cheerio.load(pageFetch.text);
  const pageTitle = ($('title').first().text() || extractMeta($, 'og:title') || '').trim();
  const metaDescription =
    extractMeta($, 'description') || extractMeta($, 'og:description') || '';
  const canonical =
    $('link[rel="canonical"]').attr('href')?.trim() ||
    extractMeta($, 'og:url') ||
    '';
  const metaRobots = (
    extractMeta($, 'robots') ||
    extractMeta($, 'googlebot') ||
    ''
  ).trim();

  const og = {
    title: extractMeta($, 'og:title'),
    description: extractMeta($, 'og:description'),
    image: extractMeta($, 'og:image') || extractMeta($, 'og:image:url'),
    url: extractMeta($, 'og:url'),
    type: extractMeta($, 'og:type'),
  };
  const twitter = {
    card: extractMeta($, 'twitter:card'),
    title: extractMeta($, 'twitter:title'),
    description: extractMeta($, 'twitter:description'),
    image: extractMeta($, 'twitter:image') || extractMeta($, 'twitter:image:src'),
  };

  // Favicon / apple-touch (ignore empty data: placeholders like data:,)
  const rawIconHref =
    $('link[rel="icon"]').attr('href') ||
    $('link[rel="shortcut icon"]').attr('href') ||
    $('link[rel="apple-touch-icon"]').attr('href') ||
    '';
  const iconHref = /^data:,?\s*$/i.test(rawIconHref.trim()) ? '' : rawIconHref;
  const appleTouchHref = $('link[rel="apple-touch-icon"]').attr('href') || '';
  const faviconResolved = iconHref
    ? /^data:/i.test(iconHref)
      ? iconHref
      : resolveHref(finalUrl, iconHref)
    : '';
  const appleTouchResolved = appleTouchHref ? resolveHref(finalUrl, appleTouchHref) : '';

  // Manifest
  const manifestHref = $('link[rel="manifest"]').attr('href') || '';
  const manifestResolved = resolveHref(finalUrl, manifestHref);

  const schemaTypes = parseJsonLdTypes(pageFetch.text);
  const internalLinks = countHomepageInternalLinks($, finalUrl);

  // Parallel: robots.txt, sitemap candidates, manifest JSON, default /favicon.ico
  const origin = `${finalUrl.protocol}//${finalUrl.host}`;
  const robotsUrl = new URL('/robots.txt', origin);
  const defaultFaviconUrl = new URL('/favicon.ico', origin);

  const sitemapCandidates: string[] = [];
  const pushSitemap = (u: string) => {
    if (u && !sitemapCandidates.includes(u)) sitemapCandidates.push(u);
  };

  const [robotsFetch, manifestFetch, defaultFavFetch] = await Promise.all([
    fetchText(robotsUrl, 'text/plain,*/*;q=0.8'),
    manifestResolved
      ? fetchText(new URL(manifestResolved), 'application/manifest+json,application/json,*/*;q=0.8')
      : Promise.resolve({ ok: false, status: 0, text: '', finalUrl: '' }),
    faviconResolved
      ? Promise.resolve({ ok: true, status: 200, text: 'linked', finalUrl: faviconResolved })
      : fetchText(defaultFaviconUrl, 'image/*,*/*;q=0.8'),
  ]);

  const robotsPresent = robotsFetch.ok && robotsFetch.text.trim().length > 0;
  const robotsSample = robotsPresent
    ? robotsFetch.text.trim().slice(0, 600)
    : '';
  const blocksAll = robotsPresent ? robotsBlocksAll(robotsFetch.text) : false;
  const sitemapRefs = robotsPresent ? extractSitemapRefs(robotsFetch.text) : [];
  for (const ref of sitemapRefs) pushSitemap(resolveHref(finalUrl, ref));
  pushSitemap(`${origin}/sitemap.xml`);
  pushSitemap(`${origin}/sitemap_index.xml`);
  pushSitemap(`${origin}/sitemap-index.xml`);

  // Probe sitemaps until one works (cap 4)
  let sitemapPresent = false;
  let sitemapUrl = '';
  let sitemapStatus: number | null = null;
  let sitemapUrlCount: number | null = null;
  for (const candidate of sitemapCandidates.slice(0, 4)) {
    let candidateUrl: URL;
    try {
      candidateUrl = new URL(candidate);
    } catch {
      continue;
    }
    const sm = await fetchText(candidateUrl, 'application/xml,text/xml,*/*;q=0.8');
    sitemapStatus = sm.status || null;
    if (sm.ok && /<urlset|<sitemapindex/i.test(sm.text)) {
      sitemapPresent = true;
      sitemapUrl = sm.finalUrl || candidate;
      sitemapUrlCount = estimateSitemapUrls(sm.text);
      break;
    }
  }

  let manifestName = '';
  let manifestValid = false;
  if (manifestResolved && manifestFetch.ok && manifestFetch.text.trim()) {
    try {
      const json = JSON.parse(manifestFetch.text) as Record<string, unknown>;
      manifestValid = typeof json === 'object' && json != null;
      const name = typeof json.name === 'string' ? json.name : '';
      const short = typeof json.short_name === 'string' ? json.short_name : '';
      manifestName = (name || short || '').trim();
      if (!manifestName && !json.icons) manifestValid = false;
    } catch {
      manifestValid = false;
    }
  }

  const faviconPresent =
    Boolean(faviconResolved) ||
    (defaultFavFetch.ok && defaultFavFetch.status > 0 && defaultFavFetch.status < 400);

  const items: SeoInventoryItem[] = [];
  const issues: string[] = [];
  const pitches: { problem: string; impact: string }[] = [];

  const add = (item: SeoInventoryItem) => {
    items.push(item);
    if (item.status === 'ok') return;
    if (item.problem && item.impact) {
      pitches.push({ problem: item.problem, impact: item.impact });
    }
    issues.push(`${item.label}: ${item.detail}`);
  };

  add({
    id: 'title',
    label: 'Page title',
    status: pageTitle ? (pageTitle.length > 60 ? 'warn' : 'ok') : 'missing',
    detail: pageTitle
      ? pageTitle.length > 60
        ? `Present but long (${pageTitle.length} chars): "${pageTitle.slice(0, 80)}"`
        : `"${pageTitle}"`
      : 'No <title> tag',
    problem: pageTitle ? undefined : 'The homepage has no page title',
    impact: pageTitle
      ? undefined
      : 'Google and browser tabs show a bare URL instead of the business name — you lose click-throughs.',
  });

  add({
    id: 'meta_description',
    label: 'Meta description',
    status: metaDescription ? (metaDescription.length < 50 ? 'warn' : 'ok') : 'missing',
    detail: metaDescription
      ? metaDescription.length < 50
        ? `Present but short (${metaDescription.length} chars)`
        : `Present (${metaDescription.length} chars)`
      : 'Missing meta description',
    problem: metaDescription ? undefined : 'Missing meta description',
    impact: metaDescription
      ? undefined
      : 'Search results show a random snippet instead of a controlled pitch — weaker local search clicks.',
  });

  const canonicalResolved = resolveHref(finalUrl, canonical);
  add({
    id: 'canonical',
    label: 'Canonical URL',
    status: canonicalResolved ? 'ok' : 'missing',
    detail: canonicalResolved || 'No rel=canonical',
    problem: canonicalResolved ? undefined : 'No canonical URL tag',
    impact: canonicalResolved
      ? undefined
      : 'Google may treat www / non-www / tracking URLs as duplicates and split your ranking power.',
  });

  const robotsLower = metaRobots.toLowerCase();
  const noindex = /\bnoindex\b/.test(robotsLower);
  add({
    id: 'meta_robots',
    label: 'Meta robots',
    status: noindex ? 'error' : metaRobots ? 'ok' : 'ok',
    detail: noindex
      ? `Blocks indexing: "${metaRobots}"`
      : metaRobots
        ? `"${metaRobots}"`
        : 'Not set (defaults to indexable)',
    problem: noindex ? 'Homepage is marked noindex' : undefined,
    impact: noindex
      ? 'Search engines are told not to show this page — the site can stay invisible in Google.'
      : undefined,
  });

  const ogImageOk = Boolean(og.image) && (looksLikeImageUrl(og.image) || og.image.startsWith('http'));
  add({
    id: 'og_image',
    label: 'Open Graph image',
    status: ogImageOk ? 'ok' : 'missing',
    detail: ogImageOk ? og.image : 'No og:image',
    problem: ogImageOk ? undefined : 'No Open Graph share image (og:image)',
    impact: ogImageOk
      ? undefined
      : 'Links shared on Facebook, iMessage, Slack, and LinkedIn show a blank or random preview — looks unprofessional and kills click-through.',
  });

  add({
    id: 'og_title',
    label: 'Open Graph title',
    status: og.title ? 'ok' : 'warn',
    detail: og.title || 'Missing og:title (falls back to page title)',
    problem: og.title ? undefined : 'Missing og:title',
    impact: og.title
      ? undefined
      : 'Social previews may use a weak or truncated fallback title when the page is shared.',
  });

  add({
    id: 'og_description',
    label: 'Open Graph description',
    status: og.description ? 'ok' : 'warn',
    detail: og.description ? `Present (${og.description.length} chars)` : 'Missing og:description',
    problem: og.description ? undefined : 'Missing og:description',
    impact: og.description
      ? undefined
      : 'Share previews lack a controlled blurb — platforms invent one from body text.',
  });

  const twitterOk = Boolean(twitter.card || twitter.image || ogImageOk);
  add({
    id: 'twitter_card',
    label: 'Twitter / X card',
    status: twitter.card || twitter.image ? 'ok' : ogImageOk ? 'warn' : 'missing',
    detail: twitter.card
      ? `card=${twitter.card}${twitter.image ? ` · image set` : ''}`
      : twitter.image
        ? 'Image set (no twitter:card)'
        : ogImageOk
          ? 'No twitter:* tags — may fall back to Open Graph'
          : 'No Twitter card tags',
    problem: twitterOk ? undefined : 'No Twitter/X card tags',
    impact: twitterOk
      ? undefined
      : 'Shares on X/Twitter look incomplete — no large image card when people post your link.',
  });

  add({
    id: 'favicon',
    label: 'Favicon',
    status: faviconPresent ? 'ok' : 'missing',
    detail: faviconPresent
      ? faviconResolved || `${origin}/favicon.ico`
      : 'No favicon link or /favicon.ico',
    problem: faviconPresent ? undefined : 'No favicon',
    impact: faviconPresent
      ? undefined
      : 'Browser tabs show a generic icon — the brand looks unfinished next to competitors.',
  });

  add({
    id: 'apple_touch_icon',
    label: 'Apple touch icon',
    status: appleTouchResolved ? 'ok' : 'warn',
    detail: appleTouchResolved || 'No apple-touch-icon',
    problem: appleTouchResolved ? undefined : 'No apple-touch-icon',
    impact: appleTouchResolved
      ? undefined
      : 'Add-to-Home-Screen on iPhone uses a blurry screenshot instead of a crisp brand icon.',
  });

  add({
    id: 'manifest',
    label: 'Web app manifest',
    status: manifestResolved
      ? manifestValid
        ? 'ok'
        : 'warn'
      : 'missing',
    detail: manifestResolved
      ? manifestValid
        ? `Present${manifestName ? `: ${manifestName}` : ''}`
        : `Linked but invalid/empty JSON (${manifestResolved})`
      : 'No link rel=manifest',
    problem: manifestResolved && manifestValid ? undefined : 'Web app manifest missing or invalid',
    impact:
      manifestResolved && manifestValid
        ? undefined
        : 'Browsers cannot offer a proper “Add to Home Screen” / install experience — weaker mobile brand presence.',
  });

  add({
    id: 'robots_txt',
    label: 'robots.txt',
    status: !robotsPresent ? 'missing' : blocksAll ? 'error' : 'ok',
    detail: !robotsPresent
      ? 'Not found at /robots.txt'
      : blocksAll
        ? 'Present but Disallow: / blocks all crawlers'
        : `Present${sitemapRefs.length ? ` · ${sitemapRefs.length} sitemap ref(s)` : ''}`,
    problem: !robotsPresent
      ? 'No robots.txt file'
      : blocksAll
        ? 'robots.txt blocks all crawlers (Disallow: /)'
        : undefined,
    impact: !robotsPresent
      ? 'You cannot steer Googlebot or declare a sitemap — crawlers guess what to index.'
      : blocksAll
        ? 'Search engines are told to stay out — rankings and rich results cannot appear.'
        : undefined,
  });

  add({
    id: 'sitemap',
    label: 'XML sitemap',
    status: sitemapPresent ? 'ok' : 'missing',
    detail: sitemapPresent
      ? `${sitemapUrl}${sitemapUrlCount != null ? ` · ~${sitemapUrlCount} URL entries` : ''}`
      : 'No sitemap.xml (or sitemap index) found',
    problem: sitemapPresent ? undefined : 'No XML sitemap',
    impact: sitemapPresent
      ? undefined
      : 'Google has no map of your pages — new or deep pages get discovered slowly or not at all.',
  });

  const localBusiness = schemaTypes.some((t) =>
    /localbusiness|organization|restaurant|store|medicalbusiness|professionalService|homeandconstructionbusiness|foodestablishment|attorney|dentist|realestateagent/i.test(
      t,
    ),
  );
  add({
    id: 'structured_data',
    label: 'Structured data (JSON-LD)',
    status: schemaTypes.length === 0 ? 'missing' : localBusiness ? 'ok' : 'warn',
    detail:
      schemaTypes.length === 0
        ? 'No JSON-LD blocks found'
        : `Types: ${schemaTypes.slice(0, 8).join(', ')}${schemaTypes.length > 8 ? '…' : ''}${
            localBusiness ? '' : ' (no LocalBusiness / Organization)'
          }`,
    problem:
      schemaTypes.length === 0
        ? 'No structured data (JSON-LD)'
        : localBusiness
          ? undefined
          : 'Structured data present but no LocalBusiness markup',
    impact:
      schemaTypes.length === 0
        ? 'Google cannot power rich results (hours, ratings, business details) from your site markup.'
        : localBusiness
          ? undefined
          : 'Local pack / knowledge-panel style rich results are harder to earn without LocalBusiness schema.',
  });

  const { grade, score } = computeGrade(items);

  return {
    ok: true,
    url: startUrl.toString(),
    final_url: finalUrl.toString(),
    grade,
    score,
    items,
    issues,
    pitches,
    open_graph: og,
    twitter,
    page: {
      title: pageTitle,
      meta_description: metaDescription,
      canonical: canonicalResolved,
      meta_robots: metaRobots,
    },
    favicon: {
      present: faviconPresent,
      href: faviconResolved || (faviconPresent ? `${origin}/favicon.ico` : ''),
      apple_touch: Boolean(appleTouchResolved),
    },
    manifest: {
      present: Boolean(manifestResolved),
      href: manifestResolved,
      name: manifestName,
      valid: manifestValid,
    },
    robots_txt: {
      present: robotsPresent,
      url: robotsUrl.toString(),
      blocks_all: blocksAll,
      sitemap_refs: sitemapRefs,
      sample: robotsSample,
    },
    sitemap: {
      present: sitemapPresent,
      url: sitemapUrl,
      url_count_estimate: sitemapUrlCount,
      status_code: sitemapStatus,
    },
    structured_data: {
      present: schemaTypes.length > 0,
      types: schemaTypes,
      count: schemaTypes.length,
    },
    internal_links: internalLinks,
  };
}

export function formatSeoInventoryResults(
  result: Extract<SeoInventoryResponse, { ok: true }>,
): string {
  const lines = [
    `SEO inventory — ${result.final_url}`,
    `Grade: ${result.grade} (${result.score}/100)`,
    '',
    'Checklist:',
  ];
  for (const item of result.items) {
    const mark =
      item.status === 'ok' ? '✓' : item.status === 'warn' ? '~' : item.status === 'error' ? '✗' : '✗';
    lines.push(`  ${mark} ${item.label}: ${item.detail}`);
  }
  if (result.pitches.length) {
    lines.push('', 'Customer pitches (Problem → Impact):');
    for (const p of result.pitches.slice(0, 10)) {
      lines.push(`• Problem: ${p.problem} → Impact: ${p.impact}`);
    }
  }
  if (result.issues.length) {
    lines.push('', `Issues (${result.issues.length}):`, ...result.issues.slice(0, 14).map((i) => `• ${i}`));
  }
  return lines.join('\n');
}
