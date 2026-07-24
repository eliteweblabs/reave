/**
 * Dashboard review notifications for phone push alerts (uptime, system, etc.).
 */

import {
  storeCountPendingPushAlerts,
  storeListPendingPushAlerts,
  type PushAlert,
  type PushAlertKind,
} from './pushAlertStore';

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

export function toPushAlertReviewNotification(alert: PushAlert): PushAlertReviewNotification {
  return {
    id: alert.id,
    type: 'push_alert',
    alertKind: alert.kind,
    title: alert.title,
    detail: alert.detail,
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
  return pending.map(toPushAlertReviewNotification);
}

export async function countPushAlertNotifications(): Promise<number> {
  return storeCountPendingPushAlerts({ maxAgeDays: 14 });
}
