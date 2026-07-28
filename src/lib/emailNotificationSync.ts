/**
 * Keep dashboard review alerts in sync when inbox messages are deleted or archived.
 */

import { storeUpdateEmailInbox } from './emailInboxStore';
import { storeAckPushAlertsForEmail } from './pushAlertStore';

export type DismissEmailNotificationsOpts = {
  /** When false, skip setting automationAckAt (e.g. row is about to be deleted). Default true. */
  markAutomationAck?: boolean;
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
    const updated = await storeUpdateEmailInbox(id, { markAutomationAck: true }).catch(() => null);
    automationAcked = Boolean(updated?.automationAckAt);
  }

  return { pushAlertsAcked, automationAcked };
}
