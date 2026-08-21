/**
 * GET  /api/work/[slug]/link — list tracked share links for a project
 * POST /api/work/[slug]/link — create a tracked redirect link
 */
import type { APIContext } from 'astro';
import { isSafeWorkSlug, storeReadWork } from '../../../../lib/workStore';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import {
  createTrackedProjectLink,
  deleteTrackedLink,
  dismissTrackedLinkView,
  listTrackedLinksForJob,
  type TrackedLinkChannel,
} from '../../../../lib/linkTracking';
import { qrCodeDataUrl } from '../../../../lib/qrCode';
import { isAuditJob } from '../../../../lib/auditReportCard';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


const CHANNELS = new Set<TrackedLinkChannel>(['share', 'email', 'sms', 'manual']);

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return jsonResponse({ ok: false, error: 'Invalid slug' }, 400);
  const job = await storeReadWork(slug);
  if (!job) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  const links = await listTrackedLinksForJob(slug, { limit: 20, since: job.created });
  return jsonResponse({ ok: true, links });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return jsonResponse({ ok: false, error: 'Invalid slug' }, 400);

  const job = await storeReadWork(slug);
  if (!job) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }

  const contactUid = String(body.contact_uid ?? job.contact_uid ?? '').trim();
  if (!contactUid) return jsonResponse({ ok: false, error: 'Project has no linked client' }, 400);

  const tab =
    typeof body.tab === 'string' && body.tab.trim()
      ? body.tab.trim()
      : isAuditJob(job)
        ? 'audit'
        : 'work';
  const channelRaw = typeof body.channel === 'string' ? body.channel.trim() : 'share';
  const channel = CHANNELS.has(channelRaw as TrackedLinkChannel)
    ? (channelRaw as TrackedLinkChannel)
    : 'share';

  const created = await createTrackedProjectLink({
    jobSlug: slug,
    contactUid,
    tab: tab || undefined,
    channel,
    sentBy: userId,
    request: context.request,
  });

  if (!created.ok) return jsonResponse({ ok: false, error: created.error }, 400);
  const qr_data_url = await qrCodeDataUrl(created.url, 200);
  return jsonResponse({ ok: true, link: created.link, url: created.url, qr_data_url });
}

export async function PATCH(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return jsonResponse({ ok: false, error: 'Invalid slug' }, 400);
  const job = await storeReadWork(slug);
  if (!job) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const token = String(body.token ?? '').trim();
  if (!token) return jsonResponse({ ok: false, error: 'token is required' }, 400);

  const links = await listTrackedLinksForJob(slug, { limit: 50, since: job.created });
  if (!links.some((l) => l.token === token)) {
    return jsonResponse({ ok: false, error: 'Link not found for this project' }, 404);
  }

  const dismiss = String(body.dismiss ?? 'view').trim();
  if (dismiss === 'sent') {
    const result = await deleteTrackedLink(token);
    if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 404);
    return jsonResponse({ ok: true });
  }

  const result = await dismissTrackedLinkView(token);
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 404);
  return jsonResponse({ ok: true, link: result.link });
}
