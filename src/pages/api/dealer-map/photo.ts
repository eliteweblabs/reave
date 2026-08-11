/**
 * GET /api/dealer-map/photo — proxy Places photo bytes for pin faces.
 * Query: name (places/.../photos/...), size (32–256, default 64).
 */

import type { APIContext } from 'astro';
import { fetchDealerPlacePhoto } from '../../../lib/dealerMapPlaces';
import { checkInMemoryRateLimit } from '../../../lib/inMemoryRateLimit';

export const prerender = false;

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export async function GET(context: APIContext): Promise<Response> {
  const ip = clientIp(context.request);
  const limit = checkInMemoryRateLimit(`dealer-map-photo:${ip}`, {
    windowMs: 60_000,
    maxPerWindow: 120,
  });
  if (!limit.ok) {
    return new Response('Too many requests', { status: 429 });
  }

  const url = new URL(context.request.url);
  const name = url.searchParams.get('name')?.trim() || '';
  const size = Number(url.searchParams.get('size') || 64);

  const result = await fetchDealerPlacePhoto(name, size);
  if (!result.ok) {
    return new Response(result.error, { status: result.status });
  }

  return new Response(result.body, {
    status: 200,
    headers: {
      'Content-Type': result.contentType,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
