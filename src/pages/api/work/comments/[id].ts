/**
 * PATCH /api/work/comments/[id] — dismiss a project comment notification.
 */

import type { APIContext } from 'astro';
import { storeAckWorkComment } from '../../../../lib/workComments';
import { scheduleReviewsBadgePush } from '../../../../lib/pushBadgeSync';
import { getReviewsPendingCount } from '../../../../lib/reviewsPendingCount';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


export async function PATCH(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const commentId = context.params.id?.trim() ?? '';
  if (!commentId) return jsonResponse({ ok: false, error: 'Invalid comment id' }, 400);

  const result = await storeAckWorkComment(commentId);
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 404);
  scheduleReviewsBadgePush();
  const badgeCount = await getReviewsPendingCount().catch(() => undefined);
  return jsonResponse({
    ok: true,
    commentId,
    ...(badgeCount != null ? { badgeCount } : {}),
  });
}
