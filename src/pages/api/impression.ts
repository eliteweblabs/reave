import type { APIRoute } from 'astro';
import { jsonResponse } from '../../lib/apiResponse';
import { recordUdbImpression } from '../../lib/udbStats';

export const prerender = false;

export const POST: APIRoute = async () => {
  try {
    const impressions = await recordUdbImpression();
    return jsonResponse({ ok: true, impressions });
  } catch (e) {
    console.error('[api/impression]', e);
    return jsonResponse({ ok: true, impressions: 1 });
  }
};
