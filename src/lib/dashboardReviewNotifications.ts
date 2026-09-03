/**
 * Single source of truth for dashboard review banners and the footer / PWA badge count.
 * Keep badge polling, push sync, and GET /api/admin/dashboard aligned.
 */

import {
  isExpiredMeetingNotice,
  isExpiringMeetingNotice,
} from './calendarReminderLogic';
import { dedupeDashboardNotificationsByEmail } from './dashboardNotificationDedupe';
import { listReviewNotifications } from './emailAutomation';
import { listReceiptExpenseNotifications } from './emailReceiptExpense';
import { storeListEmailInbox, type EmailInboxRecord } from './emailInboxStore';
import { listEngagementNotifications } from './engagementNotifications';
import { scheduleHealExpiredMeetingNotifications } from './meetingNoticeExpiry';
import {
  healStaleWorkNotificationSlugs,
  partitionNotificationsByExistingWork,
} from './notificationWorkLinks';
import { listPushAlertNotifications } from './pushAlertNotifications';
import { storeListWork, type WorkJobSummary } from './workStore';
import { listProjectCommentNotifications } from './workCommentNotifications';

export type DashboardReviewNotification =
  | ReturnType<typeof listReviewNotifications>[number]
  | ReturnType<typeof listReceiptExpenseNotifications>[number]
  | Awaited<ReturnType<typeof listProjectCommentNotifications>>[number]
  | Awaited<ReturnType<typeof listEngagementNotifications>>[number]
  | Awaited<ReturnType<typeof listPushAlertNotifications>>[number];

export type LoadDashboardReviewNotificationsOpts = {
  /** Inbox rows (same slice as GET /api/admin/dashboard — limit 100, hide junk). */
  events?: EmailInboxRecord[];
  /** Work projects for stale work-link filtering. */
  jobs?: WorkJobSummary[];
};

/** Pending review notifications shown on the dashboard (after dedupe + work-link filter). */
export async function loadDashboardReviewNotifications(
  opts: LoadDashboardReviewNotificationsOpts = {},
): Promise<{
  notifications: DashboardReviewNotification[];
  staleSlugs: Set<string>;
}> {
  const [events, jobs] = await Promise.all([
    opts.events != null
      ? Promise.resolve(opts.events)
      : storeListEmailInbox(100, { hideJunk: true }),
    opts.jobs != null ? Promise.resolve(opts.jobs) : storeListWork(),
  ]);
  const validWorkSlugs = new Set(jobs.map((j) => j.slug));
  const [
    emailNotifications,
    receiptExpenseNotifications,
    commentNotifications,
    engagementNotifications,
    pushAlertNotifications,
  ] = await Promise.all([
    Promise.resolve(listReviewNotifications(events)),
    Promise.resolve(listReceiptExpenseNotifications(events)),
    listProjectCommentNotifications(),
    listEngagementNotifications(),
    listPushAlertNotifications(),
  ]);
  const mergedNotifications = dedupeDashboardNotificationsByEmail([
    ...emailNotifications,
    ...receiptExpenseNotifications,
    ...commentNotifications,
    ...engagementNotifications,
    ...pushAlertNotifications,
  ]).sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  const { kept, staleSlugs } = partitionNotificationsByExistingWork(
    mergedNotifications,
    validWorkSlugs,
  );
  const notifications: DashboardReviewNotification[] = [];
  const expiredMeetings: DashboardReviewNotification[] = [];
  for (const item of kept) {
    if (isExpiringMeetingNotice(item) && isExpiredMeetingNotice(item)) {
      expiredMeetings.push(item);
    } else {
      notifications.push(item);
    }
  }
  scheduleHealExpiredMeetingNotifications(expiredMeetings);
  return { notifications, staleSlugs };
}

export function scheduleHealStaleDashboardReviewSlugs(staleSlugs: Set<string>): void {
  if (staleSlugs.size > 0) {
    void healStaleWorkNotificationSlugs(staleSlugs);
  }
}
