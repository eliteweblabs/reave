/**
 * GET /go/:token — redirect to the share destination. View tracking happens on the
 * portal after deep-link dwell time or when the client expands a project accordion.
 */
import type { APIRoute } from 'astro';
import { getTrackedLink } from '../../lib/linkTracking';
import { requestOrigin } from '../../lib/requestOrigin';

export const prerender = false;

function redirectUrlWithTrack(destination: string, token: string, request: Request): string {
  try {
    const base = destination.startsWith('http') ? undefined : requestOrigin(request);
    const url = new URL(destination, base);
    url.searchParams.set('track', token);
    return url.toString();
  } catch {
    const sep = destination.includes('?') ? '&' : '?';
    return `${destination}${sep}track=${encodeURIComponent(token)}`;
  }
}

export const GET: APIRoute = async ({ params, request }) => {
  const token = (params.token ?? '').trim();
  if (!token) return new Response('Not found', { status: 404 });

  const existing = await getTrackedLink(token);
  if (!existing) return new Response('Not found', { status: 404 });

  const location = redirectUrlWithTrack(existing.destination, token, request);

  // Mutable headers — Response.redirect() is immutable and Astro appends
  // Set-Cookie on GET (not HEAD), which would otherwise 500 the request.
  return new Response(null, {
    status: 302,
    headers: { Location: location },
  });
};
