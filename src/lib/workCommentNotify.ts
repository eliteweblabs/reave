/**
 * Side effects when a client posts a comment on a project (push + agent alert).
 */

import { notifyAdminAgentOfProjectComment } from './adminAgentAlert';
import { storeReadWork } from './workStore';
import type { WorkJobComment } from './workComments';

export async function notifyProjectCommentPosted(
  slug: string,
  comment: WorkJobComment,
): Promise<void> {
  const job = await storeReadWork(slug);
  const jobTitle = job?.title || slug;
  const authorName = comment.authorName || 'Client';
  const preview =
    comment.text.length > 240 ? `${comment.text.slice(0, 237)}…` : comment.text;

  await notifyAdminAgentOfProjectComment({
    contactName: authorName,
    jobTitle,
    jobSlug: slug,
    commentText: preview,
    commentId: comment.id,
  });
}
