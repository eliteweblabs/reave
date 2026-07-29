/**
 * pexelsClient.ts — server-side Pexels photo search.
 *
 * Authentication: every request sends `Authorization: <PEXELS_API_KEY>` header.
 * The key is read via serverEnv() so it is NEVER exposed to the browser.
 *
 * Attribution (Pexels API Terms):
 *   - Always link photos back to their Pexels page (photo.url).
 *   - Always credit the photographer (photo.photographer + photo.photographerUrl).
 *   - See https://www.pexels.com/api/documentation/#guidelines
 */

import { serverEnv } from './serverEnv';

const PEXELS_BASE = 'https://api.pexels.com/v1';

// ─── Public types ─────────────────────────────────────────────────────────────

export type PexelsPhoto = {
  id: number;
  /** Pexels page for this photo — required for attribution links. */
  url: string;
  photographer: string;
  /** Photographer's Pexels profile — link here when crediting. */
  photographerUrl: string;
  alt: string;
  src: {
    original: string;
    large: string;
    medium: string;
    small: string;
    tiny: string;
  };
  width: number;
  height: number;
};

export type PexelsSearchParams = {
  query: string;
  page?: number;
  perPage?: number;
  orientation?: 'landscape' | 'portrait' | 'square';
};

export type PexelsSearchResponse =
  | {
      ok: true;
      query: string;
      page: number;
      perPage: number;
      totalResults: number;
      photos: PexelsPhoto[];
      /** Pexels next-page URL (may be absent on last page). */
      nextPage?: string;
    }
  | { ok: false; error: string; status?: number };

// ─── Raw Pexels API shapes (internal) ────────────────────────────────────────

type RawSrc = {
  original?: string;
  large?: string;
  large2x?: string;
  medium?: string;
  small?: string;
  portrait?: string;
  landscape?: string;
  tiny?: string;
};

type RawPhoto = {
  id?: number;
  url?: string;
  photographer?: string;
  photographer_url?: string;
  photographer_id?: number;
  alt?: string;
  src?: RawSrc;
  width?: number;
  height?: number;
};

type RawSearchBody = {
  photos?: RawPhoto[];
  page?: number;
  per_page?: number;
  total_results?: number;
  next_page?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isPexelsConfigured(): boolean {
  return Boolean(serverEnv('PEXELS_API_KEY')?.trim());
}

function mapPhoto(raw: RawPhoto): PexelsPhoto {
  const src = raw.src ?? {};
  return {
    id: raw.id ?? 0,
    url: String(raw.url ?? ''),
    photographer: String(raw.photographer ?? ''),
    photographerUrl: String(raw.photographer_url ?? ''),
    alt: String(raw.alt ?? ''),
    src: {
      original: String(src.original ?? src.large2x ?? src.large ?? ''),
      large: String(src.large ?? src.large2x ?? src.original ?? ''),
      medium: String(src.medium ?? src.large ?? ''),
      small: String(src.small ?? src.medium ?? ''),
      tiny: String(src.tiny ?? src.small ?? ''),
    },
    width: raw.width ?? 0,
    height: raw.height ?? 0,
  };
}

// ─── Main search function ─────────────────────────────────────────────────────

/**
 * Search Pexels for royalty-free photos.
 *
 * @param params.query       Required search string.
 * @param params.page        1-based page number (default 1).
 * @param params.perPage     Results per page, clamped to 1–80 (default 15).
 * @param params.orientation Optional filter: landscape | portrait | square.
 */
export async function pexelsSearchPhotos(
  params: PexelsSearchParams,
): Promise<PexelsSearchResponse> {
  const key = serverEnv('PEXELS_API_KEY')?.trim();
  if (!key) {
    return { ok: false, error: 'PEXELS_API_KEY is not set on this service' };
  }

  const query = params.query.trim();
  if (!query) return { ok: false, error: 'query is required' };

  const page = Math.max(1, Math.floor(params.page ?? 1) || 1);
  const perPage = Math.max(1, Math.min(80, Math.floor(params.perPage ?? 15) || 15));

  const url = new URL(`${PEXELS_BASE}/search`);
  url.searchParams.set('query', query);
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', String(perPage));
  if (params.orientation) {
    url.searchParams.set('orientation', params.orientation);
  }

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: key,
        Accept: 'application/json',
      },
    });

    // Respect rate-limit headers (read-only — we just pass the status code up).
    if (res.status === 429) {
      return { ok: false, status: 429, error: 'Pexels rate limit reached — try again shortly' };
    }

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
      return { ok: false, error: 'Invalid JSON from Pexels API' };
    }

    const b = body as RawSearchBody;
    const rawPhotos = Array.isArray(b?.photos) ? b.photos! : [];

    return {
      ok: true,
      query,
      page: b.page ?? page,
      perPage: b.per_page ?? perPage,
      totalResults: b.total_results ?? rawPhotos.length,
      photos: rawPhotos.map(mapPhoto),
      nextPage: b.next_page ?? undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Formatting helper (for agent tool output) ────────────────────────────────

/**
 * Format search results as a plain-text summary for agent / chat use.
 * Includes attribution reminder per Pexels API terms.
 */
export function formatPexelsResults(
  data: Extract<PexelsSearchResponse, { ok: true }>,
): string {
  if (data.photos.length === 0) {
    return `No Pexels photos found for "${data.query}".`;
  }

  const lines = data.photos.map((p, i) => {
    const credit = p.photographerUrl
      ? `${p.photographer} (${p.photographerUrl})`
      : p.photographer || 'Unknown';
    return [
      `${i + 1}. ${p.alt || p.photographer || 'Photo'} — ${p.url}`,
      `   Photographer: ${credit}`,
      `   Medium: ${p.src.medium}`,
      `   Large:  ${p.src.large}`,
    ].join('\n');
  });

  const header = `Pexels results for "${data.query}" (page ${data.page}, ${data.totalResults.toLocaleString()} total):`;
  const footer =
    'Attribution: always link photos to their Pexels page and credit the photographer. https://www.pexels.com/api/documentation/#guidelines';

  return `${header}\n\n${lines.join('\n\n')}\n\n${footer}`;
}
