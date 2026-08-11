/**
 * POST /api/c/[slug]/work/[jobSlug]/viewed — record a client portal project view.
 * Triggered after dwell time on deep-link or accordion expand (non-staff only).
 * Stamps last_client_viewed_at for Recently Viewed; optionally marks a tracked share open.
 */
import type { APIRoute } from 'astro';
import { getContact } from '../../../../../../lib/contactApi';
import { recordShareOpenEngagement } from '../../../../../../lib/engagementNotifications';
import { recordProjectShareView } from '../../../../../../lib/linkTracking';
import { loadPortalJob } from '../../../../../../lib/portalWorkAuth';
import {
  isLinkPreviewRequest,
  isStaffSession,
} from '../../../../../../lib/staffSession';
import { storeReadWork, storeTouchClientViewed } from '../../../../../../lib/workStore';
import { checkInMemoryRateLimit } from '../../../../../../lib/inMemoryRateLimit';
import { clientIp } from '../../../../../../lib/clientIp';

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

  const rate = checkInMemoryRateLimit(`portal-viewed:${contactUid}:${clientIp(request)}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 60,
  });
  if (!rate.ok) {
    return json({ ok: false, error: 'Too many requests. Please try again later.' }, 429);
  }

  const ctx = await loadPortalJob(contactUid, jobSlug);
  if (!ctx.ok) return json({ ok: false, error: ctx.error }, ctx.status);

  if (isStaffSession(locals) || isLinkPreviewRequest(request)) {
    return json({ ok: true, recorded: false });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    /* optional body */
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';

  const touched = await storeTouchClientViewed(jobSlug);
  if (!touched.ok) return json({ ok: false, error: touched.error }, 404);

  const share = await recordProjectShareView({
    jobSlug,
    contactUid,
    token: token || undefined,
    meta: {
      userAgent: request.headers.get('user-agent'),
      referer: request.headers.get('referer'),
    },
  });

  if (share.recorded && share.wasFirstOpen) {
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
        linkToken: share.link.token,
        destination: share.link.destination,
      });
    })();
  }

  return json({
    ok: true,
    recorded: true,
    last_client_viewed_at: touched.last_client_viewed_at,
    wasFirstOpen: share.recorded ? share.wasFirstOpen : false,
  });
};
