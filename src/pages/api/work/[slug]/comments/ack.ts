/**
 * POST /api/work/[slug]/comments/ack — mark all pending client comments on a project as seen.
 */

import type { APIContext } from 'astro';
import { isSafeWorkSlug, storeReadWork } from '../../../../../lib/workStore';
import { storeAckWorkCommentsForSlug } from '../../../../../lib/workComments';
import { scheduleReviewsBadgePush } from '../../../../../lib/pushBadgeSync';
import { getReviewsPendingCount } from '../../../../../lib/reviewsPendingCount';
import { requireDashboardUser } from '../../../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);
  if (!(await storeReadWork(slug))) return json({ ok: false, error: 'Not found' }, 404);

  const result = await storeAckWorkCommentsForSlug(slug);
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  if (result.acked > 0) scheduleReviewsBadgePush();
  const badgeCount = await getReviewsPendingCount().catch(() => undefined);
  return json({
    ok: true,
    acked: result.acked,
    ...(badgeCount != null ? { badgeCount } : {}),
  });
}
