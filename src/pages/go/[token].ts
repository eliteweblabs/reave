/**
 * GET /go/:token — record a client click and redirect to the destination URL.
 */
import type { APIRoute } from 'astro';
import { getTrackedLink, recordTrackedLinkClick } from '../../lib/linkTracking';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const token = (params.token ?? '').trim();
  if (!token) return new Response('Not found', { status: 404 });

  const existing = await getTrackedLink(token);
  if (!existing) return new Response('Not found', { status: 404 });

  await recordTrackedLinkClick(token, {
    userAgent: request.headers.get('user-agent'),
    referer: request.headers.get('referer'),
  });

  return Response.redirect(existing.destination, 302);
};
