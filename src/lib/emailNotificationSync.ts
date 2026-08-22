/**
 * Keep dashboard review alerts in sync when inbox messages are deleted or archived.
 * Deleting an inbox row is a guaranteed no-notification — every delete path
 * (store + list-time orphan heal) must dismiss alerts tied to that email.
 */

import { storeUpdateEmailInbox } from './emailInboxStore';
import { scheduleReviewsBadgePush } from './pushBadgeSync';
import { storeAckPushAlertsForEmail } from './pushAlertStore';

export type DismissEmailNotificationsOpts = {
  /** When false, skip setting automationAckAt (e.g. row is about to be deleted). Default true. */
  markAutomationAck?: boolean;
  /** When false, skip scheduling a PWA icon badge sync push. Default true. */
  syncBadge?: boolean;
};

/** Dismiss push alerts and automation review banners tied to an inbox message. */
export async function dismissEmailRelatedNotifications(
  emailId: string,
  opts?: DismissEmailNotificationsOpts,
): Promise<{ pushAlertsAcked: number; automationAcked: boolean }> {
  const id = emailId.trim();
  if (!id) return { pushAlertsAcked: 0, automationAcked: false };

  const pushAlertsAcked = await storeAckPushAlertsForEmail(id).catch(() => 0);

  let automationAcked = false;
  if (opts?.markAutomationAck !== false) {
    const updated = await storeUpdateEmailInbox(id, {
      acceptAutomationDecision: true,
      markAutomationAck: true,
    }).catch(() => null);
    automationAcked = Boolean(updated?.automationAckAt);
  }

  // Always coalesce a badge sync — callers invoke this when a review surface
  // changed (ack / archive / delete). Debouncing absorbs bulk dismissals.
  if (opts?.syncBadge !== false) {
    scheduleReviewsBadgePush();
  }

  return { pushAlertsAcked, automationAcked };
}
