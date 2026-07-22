/**
 * GET /go/:token — record a client click and redirect to the destination URL.
 * Clicks by signed-in users (owner previewing before sending) are not counted.
 */
import type { APIRoute } from 'astro';
import { getTrackedLink, recordTrackedLinkClick } from '../../lib/linkTracking';

export const prerender = false;

export const GET: APIRoute = async ({ params, request, locals }) => {
  const token = (params.token ?? '').trim();
  if (!token) return new Response('Not found', { status: 404 });

  const existing = await getTrackedLink(token);
  if (!existing) return new Response('Not found', { status: 404 });

  // Don't count/mark as viewed when a signed-in user (i.e. the owner previewing
  // a link before sending it) opens it — only anonymous recipients count.
  const userId = locals.auth?.()?.userId ?? null;
  if (!userId) {
    await recordTrackedLinkClick(token, {
      userAgent: request.headers.get('user-agent'),
      referer: request.headers.get('referer'),
    });
  }

  return Response.redirect(existing.destination, 302);
};
