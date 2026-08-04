/**
 * Dashboard review notifications for phone push alerts (uptime, system, etc.).
 */

import {
  bestWorkDisplayName,
  emailIdFromPushAlertTag,
  normalizePushAlertCopy,
  siriProposalSlugFromTag,
  workSlugFromAdminUrl,
} from './notificationFormat';
import { storeGetEmailInbox } from './emailInboxStore';
import {
  storeCountPendingPushAlerts,
  storeListPendingPushAlerts,
  type PushAlert,
  type PushAlertKind,
} from './pushAlertStore';
import { storeReadWork } from './workStore';

export type PushAlertReviewNotification = {
  id: string;
  type: 'push_alert';
  alertKind: PushAlertKind;
  title: string;
  detail: string;
  receivedAt: string;
  alertId: string;
  url: string;
  tag: string;
  emailId?: string;
  from?: string;
  subject?: string;
  contactName?: string | null;
  verificationCode?: string | null;
  deleteAfterAt?: string | null;
};

async function resolvePushAlertDisplayName(alert: PushAlert): Promise<string | undefined> {
  const slug = siriProposalSlugFromTag(alert.tag) ?? workSlugFromAdminUrl(alert.url);
  if (!slug) return undefined;
  const job = await storeReadWork(slug).catch(() => null);
  if (!job) return undefined;
  return bestWorkDisplayName(job);
}

async function resolveLinkedInboxEmail(alert: PushAlert) {
  let emailId = emailIdFromPushAlertTag(alert.tag);
  if (!emailId && alert.url?.trim()) {
    try {
      emailId =
        new URL(alert.url.trim(), 'https://example.com').searchParams.get('email')?.trim() || null;
    } catch {
      emailId = null;
    }
  }
  if (!emailId) return null;
  return storeGetEmailInbox(emailId).catch(() => null);
}

export async function toPushAlertReviewNotification(
  alert: PushAlert,
): Promise<PushAlertReviewNotification> {
  const [displayName, inbox] = await Promise.all([
    resolvePushAlertDisplayName(alert),
    resolveLinkedInboxEmail(alert),
  ]);
  const copy = normalizePushAlertCopy(alert, { displayName });
  return {
    id: alert.id,
    type: 'push_alert',
    alertKind: alert.kind,
    title: copy.title,
    detail: copy.detail,
    receivedAt: alert.createdAt,
    alertId: alert.id,
    url: alert.url,
    tag: alert.tag,
    ...(inbox
      ? {
          emailId: inbox.id,
          from: inbox.from || '',
          subject: inbox.subject || '',
          contactName: inbox.contactName,
          verificationCode: inbox.verificationCode,
          deleteAfterAt: inbox.deleteAfterAt,
        }
      : {}),
  };
}

export async function listPushAlertNotifications(opts?: {
  limit?: number;
  maxAgeDays?: number;
}): Promise<PushAlertReviewNotification[]> {
  const pending = await storeListPendingPushAlerts(opts);
  return Promise.all(pending.map((alert) => toPushAlertReviewNotification(alert)));
}

export async function countPushAlertNotifications(): Promise<number> {
  return storeCountPendingPushAlerts({ maxAgeDays: 14 });
}
