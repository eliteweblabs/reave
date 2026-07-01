/**
 * GET  /api/work/[slug]/link — list tracked share links for a project
 * POST /api/work/[slug]/link — create a tracked redirect link
 */
import type { APIContext } from 'astro';
import { isSafeWorkSlug, storeReadWork } from '../../../../lib/workStore';
import {
  createTrackedProjectLink,
  listTrackedLinksForJob,
  type TrackedLinkChannel,
} from '../../../../lib/linkTracking';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const CHANNELS = new Set<TrackedLinkChannel>(['share', 'email', 'sms', 'manual']);

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);
  if (!(await storeReadWork(slug))) return json({ ok: false, error: 'Not found' }, 404);

  const links = await listTrackedLinksForJob(slug, { limit: 20 });
  return json({ ok: true, links });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);

  const job = await storeReadWork(slug);
  if (!job) return json({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }

  const contactUid = String(body.contact_uid ?? job.contact_uid ?? '').trim();
  if (!contactUid) return json({ ok: false, error: 'Project has no linked client' }, 400);

  const tab = typeof body.tab === 'string' ? body.tab.trim() : 'work';
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

  if (!created.ok) return json({ ok: false, error: created.error }, 400);
  return json({ ok: true, link: created.link, url: created.url });
}
