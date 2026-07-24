/**
 * GET /go/:token — record a client click and redirect to the destination URL.
 * Clicks by signed-in users (owner previewing before sending) are not counted.
 */
import type { APIRoute } from 'astro';
import { getContact } from '../../lib/contactApi';
import { recordShareOpenEngagement } from '../../lib/engagementNotifications';
import { getTrackedLink, recordTrackedLinkClick } from '../../lib/linkTracking';
import { storeReadWork } from '../../lib/workStore';

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

  return Response.redirect(existing.destination, 302);
};
