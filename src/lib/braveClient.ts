import { serverEnv } from './serverEnv';

const BRAVE_WEB_SEARCH = 'https://api.search.brave.com/res/v1/web/search';

export type BraveSearchResult = {
  title: string;
  url: string;
  description: string;
};

export type BraveSearchResponse =
  | { ok: true; query: string; results: BraveSearchResult[] }
  | { ok: false; error: string; status?: number };

export function isBraveConfigured(): boolean {
  return Boolean(serverEnv('BRAVE_API_KEY')?.trim());
}

/** Top web results from Brave Search API. */
export async function braveSearch(query: string, limit = 5): Promise<BraveSearchResponse> {
  const key = serverEnv('BRAVE_API_KEY')?.trim();
  if (!key) {
    return { ok: false, error: 'BRAVE_API_KEY is not set on this service' };
  }

  const q = query.trim();
  if (!q) return { ok: false, error: 'query is required' };

  const count = Math.max(1, Math.min(20, Math.floor(limit) || 5));
  const url = new URL(BRAVE_WEB_SEARCH);
  url.searchParams.set('q', q);
  url.searchParams.set('count', String(count));

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': key,
      },
    });

    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: text.slice(0, 300) || res.statusText,
      };
    }

    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      return { ok: false, error: 'Invalid JSON from Brave Search' };
    }

    const web = (body as { web?: { results?: unknown[] } })?.web;
    const rows = Array.isArray(web?.results) ? web!.results! : [];
    const results: BraveSearchResult[] = rows.slice(0, count).map((row) => {
      const r = row as { title?: string; url?: string; description?: string };
      return {
        title: String(r.title ?? '').trim() || '(no title)',
        url: String(r.url ?? '').trim(),
        description: String(r.description ?? '').trim(),
      };
    });

    return { ok: true, query: q, results };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Plain-text summary for tool output. */
export function formatBraveResults(data: Extract<BraveSearchResponse, { ok: true }>): string {
  if (data.results.length === 0) return `No web results for "${data.query}".`;
  const lines = data.results.map(
    (r, i) =>
      `${i + 1}. ${r.title}\n   ${r.url}${r.description ? `\n   ${r.description}` : ''}`,
  );
  return `Web results for "${data.query}":\n\n${lines.join('\n\n')}`;
}
