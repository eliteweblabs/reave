/**
 * Pending review count for admin footer + PWA icon badge
 * (email automation + project comments + engagement events + push alerts).
 */

import { dedupeDashboardNotificationsByEmail } from './dashboardNotificationDedupe';
import { listReviewNotifications } from './emailAutomation';
import { storeListEmailInbox } from './emailInboxStore';
import { listEngagementNotifications } from './engagementNotifications';
import { listPushAlertNotifications } from './pushAlertNotifications';
import { listProjectCommentNotifications } from './workCommentNotifications';

export async function getReviewsPendingCount(): Promise<number> {
  const [allForDigest, commentReviews, engagementReviews, pushAlerts] = await Promise.all([
    storeListEmailInbox(500, { hideJunk: true, forDigest: true }),
    listProjectCommentNotifications({ limit: 500, maxAgeDays: 14 }),
    listEngagementNotifications({ limit: 500, maxAgeDays: 14 }),
    listPushAlertNotifications({ limit: 500, maxAgeDays: 14 }),
  ]);
  return dedupeDashboardNotificationsByEmail([
    ...listReviewNotifications(allForDigest, { limit: 500, maxAgeDays: 14 }),
    ...commentReviews,
    ...engagementReviews,
    ...pushAlerts,
  ]).length;
}
