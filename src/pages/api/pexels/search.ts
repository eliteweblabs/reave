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
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { hasStockPhotoSearch } from '../../../lib/features';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!hasStockPhotoSearch()) {
    return jsonResponse(
      {
        error: 'Stock photos module is not enabled',
        hint: 'Add website or stock_photos to this install’s features[] in config/config-{slug}.json',
      },
      404,
    );
  }

  if (!isPexelsConfigured()) {
    return jsonResponse(
      {
        error: 'Pexels is not configured',
        hint: 'Set PEXELS_API_KEY in Railway → reΛVe.app App service → Variables',
      },
      503,
    );
  }

  const url = new URL(context.request.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  if (!q) return jsonResponse({ error: 'q (search query) is required' }, 400);

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
    return jsonResponse({ error: result.error }, status);
  }

  return jsonResponse(result);
}
