/**
 * Tech Stack Detector
 * Fetches a URL (raw HTML + response headers) and runs it through
 * the Wappalyzer-lite pattern database to identify technologies.
 */

import { normalizePublicUrl } from './publicUrl';
import { fetchPublicWithRedirects } from './safePublicFetch';
import { runWappalyzer, type MatchedTech } from './wappalyzerLite';

const USER_AGENT =
  'Mozilla/5.0 (compatible; TechStackBot/1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 3_000_000;

export interface TechStackResult {
  url: string;
  status_code: number;
  technologies: MatchedTech[];
  /** Grouped by category for easy reading */
  by_category: Record<string, string[]>;
  /** Quick summary string */
  summary: string;
}

export type TechStackResponse =
  | { ok: true; data: TechStackResult }
  | { ok: false; error: string; status_code?: number };

export async function detectTechStack(urlInput: string): Promise<TechStackResponse> {
  const url = normalizePublicUrl(urlInput, false);
  if (!url) {
    return { ok: false, error: 'Invalid or blocked URL (http/https only; no localhost/private IPs)' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const fetched = await fetchPublicWithRedirects(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!fetched) {
      return { ok: false, error: 'Invalid or blocked URL (http/https only; no localhost/private IPs)' };
    }
    const res = fetched.response;

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES) {
      return {
        ok: false,
        error: `Response too large (${Math.round(buf.byteLength / 1024)} KB)`,
        status_code: res.status,
      };
    }

    const html = new TextDecoder('utf-8', { fatal: false }).decode(buf);

    // Collect all response headers into a plain object
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const technologies = runWappalyzer({
      html,
      headers,
      url: res.url || url.toString(),
    });

    // Group by category
    const by_category: Record<string, string[]> = {};
    for (const tech of technologies) {
      if (!by_category[tech.category]) by_category[tech.category] = [];
      by_category[tech.category].push(tech.name);
    }

    // Build a readable summary
    const parts: string[] = [];
    for (const [cat, names] of Object.entries(by_category).sort()) {
      parts.push(`${cat}: ${names.join(', ')}`);
    }
    const summary =
      technologies.length === 0
        ? 'No recognized technologies detected.'
        : parts.join(' · ');

    return {
      ok: true,
      data: {
        url: res.url || url.toString(),
        status_code: res.status,
        technologies,
        by_category,
        summary,
      },
    };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, error: `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s` };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
