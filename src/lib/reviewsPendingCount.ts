/**
 * Pending review count for admin footer + PWA icon badge
 * (email automation + project comments + engagement events + push alerts).
 */

import { countReviewNotifications } from './emailAutomation';
import { storeListEmailInbox } from './emailInboxStore';
import { countEngagementNotifications } from './engagementNotifications';
import { countPushAlertNotifications } from './pushAlertNotifications';
import { countProjectCommentNotifications } from './workCommentNotifications';

export async function getReviewsPendingCount(): Promise<number> {
  const [allForDigest, commentReviewsPending, engagementReviewsPending, pushAlertsPending] =
    await Promise.all([
      storeListEmailInbox(500, { hideJunk: true, forDigest: true }),
      countProjectCommentNotifications(),
      countEngagementNotifications(),
      countPushAlertNotifications(),
    ]);
  return (
    countReviewNotifications(allForDigest) +
    commentReviewsPending +
    engagementReviewsPending +
    pushAlertsPending
  );
}
