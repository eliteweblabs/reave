/**
 * Dashboard review notifications for phone push alerts (uptime, system, etc.).
 */

import {
  bestWorkDisplayName,
  normalizePushAlertCopy,
  siriProposalSlugFromTag,
  workSlugFromAdminUrl,
} from './notificationFormat';
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
};

async function resolvePushAlertDisplayName(alert: PushAlert): Promise<string | undefined> {
  const slug = siriProposalSlugFromTag(alert.tag) ?? workSlugFromAdminUrl(alert.url);
  if (!slug) return undefined;
  const job = await storeReadWork(slug).catch(() => null);
  if (!job) return undefined;
  return bestWorkDisplayName(job);
}

export async function toPushAlertReviewNotification(
  alert: PushAlert,
): Promise<PushAlertReviewNotification> {
  const displayName = await resolvePushAlertDisplayName(alert);
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
