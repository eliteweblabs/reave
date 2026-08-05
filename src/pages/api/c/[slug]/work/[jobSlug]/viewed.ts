/**
 * POST /api/c/[slug]/work/[jobSlug]/viewed — record a project share view from the portal.
 * Triggered after deep-link dwell time or when the client expands a project accordion.
 */
import type { APIRoute } from 'astro';
import { getContact } from '../../../../../../lib/contactApi';
import { recordShareOpenEngagement } from '../../../../../../lib/engagementNotifications';
import { recordProjectShareView } from '../../../../../../lib/linkTracking';
import { loadPortalJob } from '../../../../../../lib/portalWorkAuth';
import { isStaffSession } from '../../../../../../lib/staffSession';
import { storeReadWork } from '../../../../../../lib/workStore';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const contactUid = (params.slug ?? '').trim();
  const jobSlug = (params.jobSlug ?? '').trim();
  if (!contactUid || !jobSlug) return json({ ok: false, error: 'Not found' }, 404);

  const ctx = await loadPortalJob(contactUid, jobSlug);
  if (!ctx.ok) return json({ ok: false, error: ctx.error }, ctx.status);

  if (isStaffSession(locals)) {
    return json({ ok: true, recorded: false });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    /* optional body */
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';

  const result = await recordProjectShareView({
    jobSlug,
    contactUid,
    token: token || undefined,
    meta: {
      userAgent: request.headers.get('user-agent'),
      referer: request.headers.get('referer'),
    },
  });

  if (!result.recorded) return json({ ok: true, recorded: false });

  if (result.wasFirstOpen) {
    void (async () => {
      const [contactRes, job] = await Promise.all([
        getContact(contactUid).catch(() => null),
        storeReadWork(jobSlug).catch(() => null),
      ]);
      const contactName =
        contactRes && contactRes.ok ? contactRes.data.name?.trim() || 'Client' : 'Client';
      const jobTitle = job?.title?.trim() || jobSlug;
      await recordShareOpenEngagement({
        contactUid,
        contactName,
        jobSlug,
        jobTitle,
        linkToken: result.link.token,
        destination: result.link.destination,
      });
    })();
  }

  return json({ ok: true, recorded: true, wasFirstOpen: result.wasFirstOpen });
};
