/**
 * GET /api/clients/map — owner-only contact list for admin map views.
 * The public /admin/client-map page embeds data server-side instead of calling this.
 */

import type { APIContext } from 'astro';
import { jsonResponse } from '../../../lib/apiResponse';
import { loadClientsMapData } from '../../../lib/clientsMapData';
import { clientIp } from '../../../lib/clientIp';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { checkInMemoryRateLimit } from '../../../lib/inMemoryRateLimit';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const ip = clientIp(context.request);
  const limitHit = checkInMemoryRateLimit(`clients-map:${ip}`, {
    windowMs: 60_000,
    maxPerWindow: 30,
  });
  if (!limitHit.ok) {
    return jsonResponse(
      { ok: false, error: 'Too many requests — wait a moment and try again.' },
      429,
    );
  }

  const url = new URL(context.request.url);
  const limitRaw = Number(url.searchParams.get('limit') ?? 200);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 200;

  const result = await loadClientsMapData(limit);
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, result.status ?? 502);

  return jsonResponse(result.data);
}
