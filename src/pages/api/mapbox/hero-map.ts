/**
 * GET /api/mapbox/hero-map?frame=N — one frame of the hero GPS zoom ladder.
 *
 * Public (the hero is on the marketing page) but not an open Mapbox proxy: the
 * only accepted parameter is a frame index, and every other part of the request
 * comes from `heroGpsMap.ts`. Frames are transcoded to WebP and held in memory
 * so iOS pays the Mapbox round-trip once per boot instead of once per visitor.
 */
import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { getMapboxAccessToken } from '../../../lib/mapboxAccessToken';
import {
  HERO_GPS_FRAME_COUNT,
  heroGpsMapboxUrl,
  isHeroGpsFrameIndex,
} from '../../../lib/heroGpsMap';

export const prerender = false;

/** The buffer parameter is load-bearing: a `Response` body can't be `SharedArrayBuffer`-backed. */
type FrameBytes = Uint8Array<ArrayBuffer>;

type CachedFrame = { body: FrameBytes; contentType: string; etag: string };

const frameCache = new Map<number, CachedFrame>();
const inFlight = new Map<number, Promise<CachedFrame | null>>();

const UPSTREAM_TIMEOUT_MS = 8000;
/** Frames are immutable for a given index — the ladder geometry is code, not data. */
const CACHE_CONTROL = 'public, max-age=604800, s-maxage=604800, immutable';

function error(status: number, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * Mapbox only serves PNG. WebP is roughly a third of the bytes on a dark
 * basemap, which is the whole point of proxying instead of hotlinking.
 */
async function toWebp(png: FrameBytes): Promise<{ body: FrameBytes; contentType: string }> {
  try {
    const webp = await sharp(png).webp({ quality: 82, effort: 4 }).toBuffer();
    // Only worth it if it actually won.
    if (webp.length > 0 && webp.length < png.length) {
      return { body: webp, contentType: 'image/webp' };
    }
  } catch {
    /* fall back to the original PNG */
  }
  return { body: png, contentType: 'image/png' };
}

async function fetchFrame(index: number, token: string): Promise<CachedFrame | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(heroGpsMapboxUrl(index, token), { signal: controller.signal });
    if (!res.ok) return null;

    const png = new Uint8Array(await res.arrayBuffer());
    if (!png.length) return null;

    const { body, contentType } = await toWebp(png);
    const frame: CachedFrame = {
      body,
      contentType,
      etag: `"hero-map-${index}-${body.length}"`,
    };
    frameCache.set(index, frame);
    return frame;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** One upstream request per frame even when the whole ladder arrives at once. */
function loadFrame(index: number, token: string): Promise<CachedFrame | null> {
  const cached = frameCache.get(index);
  if (cached) return Promise.resolve(cached);

  let pending = inFlight.get(index);
  if (!pending) {
    pending = fetchFrame(index, token).finally(() => inFlight.delete(index));
    inFlight.set(index, pending);
  }
  return pending;
}

export const GET: APIRoute = async ({ url, request }) => {
  const token = getMapboxAccessToken();
  if (!token) return error(404, 'Mapbox is not configured');

  const raw = url.searchParams.get('frame');
  const index = raw != null && /^\d+$/.test(raw.trim()) ? Number(raw) : NaN;
  if (!isHeroGpsFrameIndex(index)) {
    return error(400, `frame must be an integer 0-${HERO_GPS_FRAME_COUNT - 1}`);
  }

  const frame = await loadFrame(index, token);
  if (!frame) return error(502, 'Map frame unavailable');

  if (request.headers.get('if-none-match') === frame.etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: frame.etag, 'Cache-Control': CACHE_CONTROL },
    });
  }

  return new Response(frame.body, {
    headers: {
      'Content-Type': frame.contentType,
      'Content-Length': String(frame.body.length),
      'Cache-Control': CACHE_CONTROL,
      ETag: frame.etag,
    },
  });
};
