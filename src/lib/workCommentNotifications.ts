/**
 * Dashboard review notifications for unread client comments on projects.
 */

import { storeListPendingWorkComments, type PendingWorkComment } from './workComments';

export type ProjectCommentReviewNotification = {
  id: string;
  type: 'project_comment';
  title: string;
  detail: string;
  receivedAt: string;
  commentId: string;
  jobSlug: string;
  jobTitle: string;
  authorName: string;
  commentText: string;
};

function commentPreview(text: string, max = 120): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function toProjectCommentReviewNotification(
  comment: PendingWorkComment,
): ProjectCommentReviewNotification {
  const who = comment.authorName || 'Client';
  const project = comment.jobTitle || comment.slug;
  return {
    id: comment.id,
    type: 'project_comment',
    title: `${who} commented on ${project}`,
    detail: commentPreview(comment.text),
    receivedAt: comment.createdAt,
    commentId: comment.id,
    jobSlug: comment.slug,
    jobTitle: project,
    authorName: who,
    commentText: comment.text,
  };
}

export async function listProjectCommentNotifications(opts?: {
  limit?: number;
  maxAgeDays?: number;
}): Promise<ProjectCommentReviewNotification[]> {
  const limit = opts?.limit ?? 20;
  const maxAgeMs = (opts?.maxAgeDays ?? 14) * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAgeMs;

  const pending = await storeListPendingWorkComments();
  return pending
    .filter((c) => new Date(c.createdAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
    .map(toProjectCommentReviewNotification);
}

export async function countProjectCommentNotifications(): Promise<number> {
  return (await listProjectCommentNotifications({ limit: 500, maxAgeDays: 14 })).length;
}
