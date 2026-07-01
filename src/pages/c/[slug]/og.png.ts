import type { APIRoute } from 'astro';
import { buildPortalOgPng, loadPortalShareMeta } from '../../../lib/portalOgImage';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const uid = (params.slug ?? '').trim();
  const meta = uid ? await loadPortalShareMeta(uid) : null;

  if (!meta) {
    return new Response('Not found', { status: 404 });
  }

  const png = await buildPortalOgPng(meta);

  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
