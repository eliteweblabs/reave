import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../lib/apiResponse';
import { parseCardDemoParam, resolveVisibleCardDemoSites } from '../../../lib/cardDemoSites';

export const prerender = false;

/** Demo portfolio for /card — loaded after first paint so NFC actions are not blocked. */
export const GET: APIRoute = async ({ url }) => {
  const demoUrl = parseCardDemoParam(url.searchParams.get('demo'));
  const { sites, single } = await resolveVisibleCardDemoSites(demoUrl);
  return jsonResponse(
    { ok: true, sites, single },
    200,
    { cache: 'public, max-age=300, stale-while-revalidate=86400' },
  );
};
