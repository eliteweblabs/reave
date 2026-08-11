/**
 * PATCH /api/work/comments/[id] — dismiss a project comment notification.
 */

import type { APIContext } from 'astro';
import { storeAckWorkComment } from '../../../../lib/workComments';
import { scheduleReviewsBadgePush } from '../../../../lib/pushBadgeSync';
import { getReviewsPendingCount } from '../../../../lib/reviewsPendingCount';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { json } from '../../../../lib/apiJson';

export const prerender = false;

export async function PATCH(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const commentId = context.params.id?.trim() ?? '';
  if (!commentId) return json({ ok: false, error: 'Invalid comment id' }, 400);

  const result = await storeAckWorkComment(commentId);
  if (!result.ok) return json({ ok: false, error: result.error }, 404);
  scheduleReviewsBadgePush();
  const badgeCount = await getReviewsPendingCount().catch(() => undefined);
  return json({
    ok: true,
    commentId,
    ...(badgeCount != null ? { badgeCount } : {}),
  });
}
