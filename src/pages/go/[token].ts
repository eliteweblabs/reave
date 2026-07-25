/**
 * GET /go/:token — record a client click and redirect to the destination URL.
 * Clicks by signed-in users (owner previewing before sending) are not counted.
 */
import type { APIRoute } from 'astro';
import { getContact } from '../../lib/contactApi';
import { recordShareOpenEngagement } from '../../lib/engagementNotifications';
import { getTrackedLink, recordTrackedLinkClick } from '../../lib/linkTracking';
import { isOwnerPreviewRequest, isStaffSession } from '../../lib/staffSession';
import { storeReadWork } from '../../lib/workStore';

export const prerender = false;

export const GET: APIRoute = async ({ params, request, locals }) => {
  const token = (params.token ?? '').trim();
  if (!token) return new Response('Not found', { status: 404 });

  const existing = await getTrackedLink(token);
  if (!existing) return new Response('Not found', { status: 404 });

  // Don't count/mark as viewed when staff preview (signed-in admin or ?preview=1).
  const skipTracking = isStaffSession(locals) || isOwnerPreviewRequest(request);
  if (!skipTracking) {
    const wasUnopened = !existing.first_clicked_at;
    await recordTrackedLinkClick(token, {
      userAgent: request.headers.get('user-agent'),
      referer: request.headers.get('referer'),
    });

    if (wasUnopened) {
      void (async () => {
        const [contactRes, job] = await Promise.all([
          getContact(existing.contact_uid).catch(() => null),
          storeReadWork(existing.job_slug).catch(() => null),
        ]);
        const contactName =
          contactRes && contactRes.ok
            ? contactRes.data.name?.trim() || 'Client'
            : 'Client';
        const jobTitle = job?.title?.trim() || existing.job_slug;
        await recordShareOpenEngagement({
          contactUid: existing.contact_uid,
          contactName,
          jobSlug: existing.job_slug,
          jobTitle,
          linkToken: token,
          destination: existing.destination,
        });
      })();
    }
  }

  // Mutable headers — Response.redirect() is immutable and Astro appends
  // Set-Cookie on GET (not HEAD), which would otherwise 500 the request.
  return new Response(null, {
    status: 302,
    headers: { Location: existing.destination },
  });
};
