import type { APIRoute } from 'astro';
import { fetchCardDemoOgImage, isAllowedCardDemoPreviewTarget } from '../../../lib/cardDemoPreview';
import { parseCardDemoParam } from '../../../lib/cardDemoSites';

export const prerender = false;

/** Cached OG image redirect for /card demo tiles. */
export const GET: APIRoute = async ({ url }) => {
  const target = parseCardDemoParam(url.searchParams.get('url'));
  if (!target || !isAllowedCardDemoPreviewTarget(target)) {
    return new Response('Invalid preview URL', { status: 400 });
  }

  const image = await fetchCardDemoOgImage(target);
  if (!image) {
    return new Response(null, {
      status: 404,
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: image,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
};
