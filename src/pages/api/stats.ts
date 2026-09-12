import type { APIRoute } from 'astro';
import { jsonResponse } from '../../lib/apiResponse';
import { getUdbStats } from '../../lib/udbStats';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const stats = await getUdbStats();
    return jsonResponse(stats);
  } catch (e) {
    console.error('[api/stats]', e);
    return jsonResponse({ impressions: 1, people: 1, day: 1 });
  }
};
