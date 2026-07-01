import type { APIRoute } from 'astro';
import { getCompanyConfig } from '../../../lib/companyConfig';
import { buildPortalOgPng, loadPortalShareMeta } from '../../../lib/portalOgImage';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const uid = (params.slug ?? '').trim();
  const meta = uid ? await loadPortalShareMeta(uid) : null;

  if (!meta) {
    return new Response('Not found', { status: 404 });
  }

  const company = await getCompanyConfig(request);
  const png = await buildPortalOgPng(meta, { fallbackLogoPath: company.logoPath });

  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
