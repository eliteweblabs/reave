/**
 * Auto-dismiss expired meeting / calendar-reminder dashboard cards.
 */

import { dismissEmailRelatedNotifications } from './emailNotificationSync';
import type { DashboardReviewNotification } from './dashboardReviewNotifications';
import { storeAckPushAlert } from './pushAlertStore';

export function scheduleHealExpiredMeetingNotifications(
  items: DashboardReviewNotification[],
): void {
  if (!items.length) return;
  void healExpiredMeetingNotifications(items);
}

export async function healExpiredMeetingNotifications(
  items: DashboardReviewNotification[],
): Promise<void> {
  await Promise.all(
    items.map((item) => dismissExpiredMeetingNotification(item).catch(() => undefined)),
  );
}

async function dismissExpiredMeetingNotification(item: DashboardReviewNotification): Promise<void> {
  const alertId = 'alertId' in item ? String(item.alertId || '').trim() : '';
  const emailId = 'emailId' in item ? String(item.emailId || '').trim() : '';

  if (alertId) {
    const result = await storeAckPushAlert(alertId);
    if (result.ok && emailId) {
      await dismissEmailRelatedNotifications(emailId, {
        markAutomationAck: true,
        syncBadge: false,
      });
    }
    return;
  }

  if (emailId) {
    await dismissEmailRelatedNotifications(emailId, { markAutomationAck: true });
  }
}
