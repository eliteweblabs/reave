/**
 * PATCH /api/work/comments/[id] — dismiss a project comment notification.
 */

import type { APIContext } from 'astro';
import { storeAckWorkComment } from '../../../../lib/workComments';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function PATCH(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const commentId = context.params.id?.trim() ?? '';
  if (!commentId) return json({ ok: false, error: 'Invalid comment id' }, 400);

  const result = await storeAckWorkComment(commentId);
  if (!result.ok) return json({ ok: false, error: result.error }, 404);
  return json({ ok: true, commentId });
}
