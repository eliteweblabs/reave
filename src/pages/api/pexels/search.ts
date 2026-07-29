/**
 * GET /api/pexels/search — server-side proxy for Pexels photo search.
 *
 * Keeps PEXELS_API_KEY server-only (never exposed to the browser).
 * Requires Clerk auth — admin use only.
 *
 * Query params:
 *   q           — search query (required)
 *   page        — 1-based page (default 1)
 *   per_page    — results per page, 1–80 (default 15)
 *   orientation — landscape | portrait | square (optional)
 *
 * Attribution: consumers must link photos to pexels.com and credit the photographer.
 * See https://www.pexels.com/api/documentation/#guidelines
 */

import type { APIContext } from 'astro';
import { isPexelsConfigured, pexelsSearchPhotos } from '../../../lib/pexelsClient';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  if (!isPexelsConfigured()) {
    return json(
      {
        error: 'Pexels is not configured',
        hint: 'Set PEXELS_API_KEY in Railway → REΛVE App service → Variables',
      },
      503,
    );
  }

  const url = new URL(context.request.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  if (!q) return json({ error: 'q (search query) is required' }, 400);

  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const perPage = Math.max(
    1,
    Math.min(80, parseInt(url.searchParams.get('per_page') ?? '15', 10) || 15),
  );
  const rawOrientation = url.searchParams.get('orientation') ?? '';
  const orientation =
    rawOrientation === 'landscape' ||
    rawOrientation === 'portrait' ||
    rawOrientation === 'square'
      ? rawOrientation
      : undefined;

  const result = await pexelsSearchPhotos({ query: q, page, perPage, orientation });

  if (!result.ok) {
    const status = result.status === 429 ? 429 : 502;
    return json({ error: result.error }, status);
  }

  return json(result);
}
