/**
 * PATCH /api/admin/engagement/[id] — dismiss an engagement notification.
 */

import type { APIContext } from 'astro';
import { storeAckEngagementEvent } from '../../../../lib/engagementStore';
import { scheduleReviewsBadgePush } from '../../../../lib/pushBadgeSync';
import { getReviewsPendingCount } from '../../../../lib/reviewsPendingCount';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


export async function PATCH(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const id = context.params.id?.trim() ?? '';
  if (!id) return jsonResponse({ ok: false, error: 'Invalid engagement id' }, 400);

  const result = await storeAckEngagementEvent(id);
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 404);
  scheduleReviewsBadgePush();
  const badgeCount = await getReviewsPendingCount().catch(() => undefined);
  return jsonResponse({
    ok: true,
    engagementId: result.id,
    ...(badgeCount != null ? { badgeCount } : {}),
  });
}
