/**
 * Pexels stock photo search client.
 *
 * Docs: https://www.pexels.com/api/documentation/
 * Auth: Authorization: <PEXELS_API_KEY> header on every request (server-only)
 *
 * Attribution requirements (Pexels API Terms):
 *   - Always link the photo/photographer back to Pexels when displaying results.
 *   - Credit the photographer (photographer + photographer_url) when possible.
 *   - Do not imply affiliation with or endorsement by Pexels.
 *   - See https://www.pexels.com/api/documentation/#guidelines
 */

import { serverEnv } from './serverEnv';

const PEXELS_BASE = 'https://api.pexels.com/v1';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PexelsPhotoSrc = {
  original: string;
  large: string;
  medium: string;
  small: string;
  tiny: string;
};

export type PexelsPhoto = {
  id: number;
  width: number;
  height: number;
  /** Photo page URL on pexels.com — link here for attribution. */
  url: string;
  photographer: string;
  photographer_url: string;
  alt: string;
  src: PexelsPhotoSrc;
  avg_color: string | null;
};

export type PexelsSearchOptions = {
  query: string;
  /** 1-based page number (default 1). */
  page?: number;
  /** Results per page, 1–80 (default 15). */
  perPage?: number;
  /** Optional: landscape | portrait | square */
  orientation?: 'landscape' | 'portrait' | 'square';
  /** Optional ISO 639-1 locale, e.g. "en-US" */
  locale?: string;
};

export type PexelsSearchResponse =
  | {
      ok: true;
      query: string;
      page: number;
      perPage: number;
      totalResults: number;
      nextPage: string | null;
      photos: PexelsPhoto[];
    }
  | { ok: false; error: string; status?: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isPexelsConfigured(): boolean {
  return Boolean(serverEnv('PEXELS_API_KEY')?.trim());
}

// ─── Main search function ─────────────────────────────────────────────────────

/**
 * Search Pexels for royalty-free photos.
 *
 * Rate limits (as of 2025):
 *   - 200 requests/hour, 20,000 requests/month.
 *   - Headers X-Ratelimit-Limit / X-Ratelimit-Remaining / X-Ratelimit-Reset.
 *   - 429 is returned when the limit is exceeded.
 */
export async function pexelsSearchPhotos(
  opts: PexelsSearchOptions,
): Promise<PexelsSearchResponse> {
  const key = serverEnv('PEXELS_API_KEY')?.trim();
  if (!key) {
    return { ok: false, error: 'PEXELS_API_KEY is not set on this service' };
  }

  const q = opts.query.trim();
  if (!q) return { ok: false, error: 'query is required' };

  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const perPage = Math.max(1, Math.min(80, Math.floor(opts.perPage ?? 15)));

  const url = new URL(`${PEXELS_BASE}/search`);
  url.searchParams.set('query', q);
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', String(perPage));
  if (opts.orientation) url.searchParams.set('orientation', opts.orientation);
  if (opts.locale) url.searchParams.set('locale', opts.locale);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: {
        Authorization: key,
        Accept: 'application/json',
      },
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (res.status === 429) {
    const reset = res.headers.get('X-Ratelimit-Reset');
    return {
      ok: false,
      status: 429,
      error: `Pexels rate limit exceeded${reset ? `. Resets at ${new Date(Number(reset) * 1000).toUTCString()}` : ''}`,
    };
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

  const raw = body as {
    total_results?: number;
    page?: number;
    per_page?: number;
    next_page?: string;
    photos?: unknown[];
  };

  const rawPhotos = Array.isArray(raw?.photos) ? raw.photos : [];

  const photos: PexelsPhoto[] = rawPhotos.map((p) => {
    const photo = p as {
      id?: number;
      width?: number;
      height?: number;
      url?: string;
      photographer?: string;
      photographer_url?: string;
      alt?: string;
      avg_color?: string;
      src?: {
        original?: string;
        large?: string;
        medium?: string;
        small?: string;
        tiny?: string;
      };
    };
    return {
      id: Number(photo.id ?? 0),
      width: Number(photo.width ?? 0),
      height: Number(photo.height ?? 0),
      url: String(photo.url ?? ''),
      photographer: String(photo.photographer ?? ''),
      photographer_url: String(photo.photographer_url ?? ''),
      alt: String(photo.alt ?? ''),
      avg_color: photo.avg_color ? String(photo.avg_color) : null,
      src: {
        original: String(photo.src?.original ?? ''),
        large: String(photo.src?.large ?? ''),
        medium: String(photo.src?.medium ?? ''),
        small: String(photo.src?.small ?? ''),
        tiny: String(photo.src?.tiny ?? ''),
      },
    };
  });

  return {
    ok: true,
    query: q,
    page,
    perPage,
    totalResults: Number(raw.total_results ?? 0),
    nextPage: raw.next_page ? String(raw.next_page) : null,
    photos,
  };
}

/** Plain-text summary for tool output. */
export function formatPexelsResults(
  data: Extract<PexelsSearchResponse, { ok: true }>,
): string {
  if (data.photos.length === 0) return `No Pexels photos found for "${data.query}".`;
  const lines = data.photos.map(
    (p, i) =>
      `${i + 1}. "${p.alt || '(no description)'}" by ${p.photographer}\n   Medium: ${p.src.medium}\n   Page:   ${p.url}\n   Photographer: ${p.photographer_url}`,
  );
  return (
    `Pexels photos for "${data.query}" (page ${data.page}, ${data.totalResults} total):\n\n` +
    lines.join('\n\n') +
    '\n\n⚠ Attribution: link photos to pexels.com and credit the photographer when displayed.'
  );
}
