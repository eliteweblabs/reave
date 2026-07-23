/**
 * Pending review count for admin footer + PWA icon badge (email automation + project comments).
 */

import { countReviewNotifications } from './emailAutomation';
import { storeListEmailInbox } from './emailInboxStore';
import { countProjectCommentNotifications } from './workCommentNotifications';

export async function getReviewsPendingCount(): Promise<number> {
  const [allForDigest, commentReviewsPending] = await Promise.all([
    storeListEmailInbox(500, { hideJunk: false, forDigest: true }),
    countProjectCommentNotifications(),
  ]);
  return countReviewNotifications(allForDigest) + commentReviewsPending;
}
