import type { APIRoute } from 'astro';
import { buildSitemapXml } from '../lib/sitemap';
import { getSiteContent } from '../lib/siteContent';
import { requestOrigin } from '../lib/requestOrigin';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const origin = requestOrigin(request).replace(/\/+$/, '');
  const xml = buildSitemapXml(origin, getSiteContent());

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
