import * as cheerio from 'cheerio';

const USER_AGENT =
  'Mozilla/5.0 (compatible; ReaveBot/1.0; +https://reave.app) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 2_000_000;
const CONTENT_CAP = 15_000;

export type FetchUrlResult = {
  url: string;
  status_code: number;
  title: string;
  content: string;
  meta_description: string;
  meta_keywords: string;
  truncated?: boolean;
};

export type FetchUrlResponse =
  | { ok: true; data: FetchUrlResult }
  | { ok: false; error: string; status_code?: number };

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '0.0.0.0') return true;

  // IPv4
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [, a, b] = v4.map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }

  // IPv6 loopback / link-local / unique-local
  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;

  return false;
}

function normalizeUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (isPrivateHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function extractMeta($: cheerio.CheerioAPI, name: string): string {
  const byName = $(`meta[name="${name}"]`).attr('content');
  if (byName?.trim()) return byName.trim();
  const byProp = $(`meta[property="${name}"]`).attr('content');
  return byProp?.trim() ?? '';
}

function htmlToText(html: string, raw: boolean): { title: string; content: string; meta_description: string; meta_keywords: string } {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, iframe').remove();

  const title = ($('title').first().text() || $('meta[property="og:title"]').attr('content') || '').trim();
  const meta_description =
    extractMeta($, 'description') || extractMeta($, 'og:description') || '';
  const meta_keywords = extractMeta($, 'keywords');

  if (raw) {
    const content = $.html('body') || html;
    return { title, content: content.trim(), meta_description, meta_keywords };
  }

  const bodyText = ($('body').text() || $.root().text())
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return { title, content: bodyText, meta_description, meta_keywords };
}

/** Fetch a public URL and return readable page content (or raw HTML). */
export async function fetchUrl(urlInput: string, raw = false): Promise<FetchUrlResponse> {
  const url = normalizeUrl(urlInput);
  if (!url) {
    return { ok: false, error: 'Invalid or blocked URL (http/https only; no localhost/private IPs)' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES) {
      return {
        ok: false,
        error: `Response too large (${Math.round(buf.byteLength / 1024)}KB; max ${MAX_HTML_BYTES / 1024}KB)`,
        status_code: res.status,
      };
    }

    const html = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    const { title, content, meta_description, meta_keywords } = htmlToText(html, raw);

    let outContent = content;
    let truncated = false;
    if (outContent.length > CONTENT_CAP) {
      outContent = `${outContent.slice(0, CONTENT_CAP)}\n\n…(truncated)`;
      truncated = true;
    }

    if (!res.ok && !html.trim()) {
      return {
        ok: false,
        error: `HTTP ${res.status} ${res.statusText}`.trim(),
        status_code: res.status,
      };
    }

    return {
      ok: true,
      data: {
        url: res.url || url.toString(),
        status_code: res.status,
        title,
        content: outContent || '(empty page)',
        meta_description,
        meta_keywords,
        ...(truncated ? { truncated: true } : {}),
      },
    };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, error: `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s` };
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (/certificate|ssl|tls/i.test(msg)) {
      return { ok: false, error: `SSL error: ${msg}` };
    }
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
