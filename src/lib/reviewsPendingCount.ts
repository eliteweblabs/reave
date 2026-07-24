/**
 * Pending review count for admin footer + PWA icon badge
 * (email automation + project comments + engagement events).
 */

import { countReviewNotifications } from './emailAutomation';
import { storeListEmailInbox } from './emailInboxStore';
import { countEngagementNotifications } from './engagementNotifications';
import { countProjectCommentNotifications } from './workCommentNotifications';

export async function getReviewsPendingCount(): Promise<number> {
  const [allForDigest, commentReviewsPending, engagementReviewsPending] = await Promise.all([
    storeListEmailInbox(500, { hideJunk: false, forDigest: true }),
    countProjectCommentNotifications(),
    countEngagementNotifications(),
  ]);
  return (
    countReviewNotifications(allForDigest) + commentReviewsPending + engagementReviewsPending
  );
}
