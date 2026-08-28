/**
 * Dashboard review notifications for phone push alerts (uptime, system, etc.).
 */

import {
  inferCalendarReminderStartMs,
  parseCalendarReminderTag,
  reminderDedupKey,
} from './calendarReminderLogic';
import { storeFindCalendarReminderByDedup } from './calendarReminderStore';
import {
  bestWorkDisplayName,
  emailIdFromPushAlertTag,
  normalizePushAlertCopy,
  siriProposalSlugFromTag,
  workSlugFromAdminUrl,
} from './notificationFormat';
import { deletedOrJunkedEmailBlocksNotification } from './emailJunkNotifyInvariant';
import { storeGetEmailInbox } from './emailInboxStore';
import { dismissEmailRelatedNotifications } from './emailNotificationSync';
import {
  isMemoryPushAlertTag,
  storeAckPushAlert,
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
  actionUrl?: string | null;
  deleteAfterAt?: string | null;
  /** Calendar reminder meeting start — used to expire the dashboard card. */
  bookingStart?: string | null;
  /** Optional action button ids from the matching email rule. */
  actions?: string[];
};

async function resolveCalendarReminderStart(alert: PushAlert): Promise<string | null> {
  if (alert.kind !== 'calendar') return null;
  const parsed = parseCalendarReminderTag(alert.tag);
  if (parsed) {
    const row = await storeFindCalendarReminderByDedup(
      reminderDedupKey(parsed.bookingUid, parsed.offsetMinutes),
    ).catch(() => null);
    if (row?.startTime) return row.startTime;
  }
  const inferred = inferCalendarReminderStartMs({
    tag: alert.tag,
    createdAt: alert.createdAt,
  });
  return inferred != null ? new Date(inferred).toISOString() : null;
}

async function resolvePushAlertDisplayName(alert: PushAlert): Promise<string | undefined> {
  const slug = siriProposalSlugFromTag(alert.tag) ?? workSlugFromAdminUrl(alert.url);
  if (!slug) return undefined;
  const job = await storeReadWork(slug).catch(() => null);
  if (!job) return undefined;
  return bestWorkDisplayName(job);
}

function emailIdFromPushAlert(alert: PushAlert): string | null {
  const fromTag = emailIdFromPushAlertTag(alert.tag);
  if (fromTag) return fromTag;
  if (!alert.url?.trim()) return null;
  try {
    return new URL(alert.url.trim(), 'https://example.com').searchParams.get('email')?.trim() || null;
  } catch {
    return null;
  }
}

async function resolveLinkedInboxEmail(alert: PushAlert) {
  const emailId = emailIdFromPushAlert(alert);
  if (!emailId) return null;
  return storeGetEmailInbox(emailId).catch(() => null);
}

export async function toPushAlertReviewNotification(
  alert: PushAlert,
): Promise<PushAlertReviewNotification> {
  const [displayName, inbox, bookingStart] = await Promise.all([
    resolvePushAlertDisplayName(alert),
    resolveLinkedInboxEmail(alert),
    resolveCalendarReminderStart(alert),
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
    ...(bookingStart ? { bookingStart } : {}),
    ...(alert.actions?.length ? { actions: alert.actions } : {}),
    ...(inbox
      ? {
          emailId: inbox.id,
          from: inbox.from || '',
          subject: inbox.subject || '',
          contactName: inbox.contactName,
          verificationCode: inbox.verificationCode,
          actionUrl: inbox.actionUrl,
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
  const kept: PushAlert[] = [];
  const staleEmailIds: string[] = [];
  const memoryAlertIds: string[] = [];
  for (const alert of pending) {
    if (isMemoryPushAlertTag(alert.tag)) {
      memoryAlertIds.push(alert.id);
      continue;
    }
    const emailId = emailIdFromPushAlert(alert);
    if (!emailId) {
      kept.push(alert);
      continue;
    }
    const inbox = await storeGetEmailInbox(emailId).catch(() => null);
    if (deletedOrJunkedEmailBlocksNotification(inbox)) {
      staleEmailIds.push(emailId);
      continue;
    }
    kept.push(alert);
  }
  if (memoryAlertIds.length) {
    void Promise.all(memoryAlertIds.map((id) => storeAckPushAlert(id).catch(() => undefined)));
  }
  if (staleEmailIds.length) {
    void Promise.all(
      [...new Set(staleEmailIds)].map((id) =>
        dismissEmailRelatedNotifications(id, { markAutomationAck: false }).catch(() => undefined),
      ),
    );
  }
  return Promise.all(kept.map((alert) => toPushAlertReviewNotification(alert)));
}

export async function countPushAlertNotifications(): Promise<number> {
  return storeCountPendingPushAlerts({ maxAgeDays: 14 });
}
