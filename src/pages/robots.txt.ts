import type { APIRoute } from 'astro';
import { buildRobotsTxt } from '../lib/sitemap';
import { requestOrigin } from '../lib/requestOrigin';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const origin = requestOrigin(request).replace(/\/+$/, '');
  const body = buildRobotsTxt(origin);

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
