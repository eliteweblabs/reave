/**
 * GET /go/:token — redirect to the share destination. View tracking happens on the
 * portal after deep-link dwell time or when the client expands a project accordion.
 */
import type { APIRoute } from 'astro';
import { getTrackedLink } from '../../lib/linkTracking';
import { requestOrigin } from '../../lib/requestOrigin';
import { redirectUrlWithTrack } from '../../lib/safeRedirectUrl';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const token = (params.token ?? '').trim();
  if (!token) return new Response('Not found', { status: 404 });

  const existing = await getTrackedLink(token);
  if (!existing) return new Response('Not found', { status: 404 });

  const location = redirectUrlWithTrack(existing.destination, token, requestOrigin(request));
  if (!location) return new Response('Not found', { status: 404 });

  // Mutable headers — Response.redirect() is immutable and Astro appends
  // Set-Cookie on GET (not HEAD), which would otherwise 500 the request.
  return new Response(null, {
    status: 302,
    headers: { Location: location },
  });
};
