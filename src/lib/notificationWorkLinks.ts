/**
 * Link dashboard notifications to work projects and clean up when projects are deleted.
 */

import { siriProposalSlugFromTag, workSlugFromAdminUrl } from './notificationFormat';
import { storeAckEngagementEventsForJobSlug } from './engagementStore';
import { scheduleReviewsBadgePush } from './pushBadgeSync';
import { storeAckPushAlertsForWorkSlug } from './pushAlertStore';

const PROJECT_LINKED_TYPES = new Set([
  'project',
  'project_match',
  'project_comment',
  'share_open',
  'contact_form',
]);

export type WorkLinkedNotification = {
  type: string;
  jobSlug?: string | null;
  url?: string;
  tag?: string;
};

/** Best-effort project slug referenced by a dashboard notification. */
export function notificationWorkSlug(item: WorkLinkedNotification): string | null {
  const fromJob = item.jobSlug?.trim();
  if (fromJob) return fromJob;
  if (item.type !== 'push_alert') return null;
  return (
    siriProposalSlugFromTag(item.tag ?? '') ?? workSlugFromAdminUrl(item.url ?? '') ?? null
  );
}

/** True when the primary "View project" action would open a work record. */
export function notificationLinksToWork(item: WorkLinkedNotification): boolean {
  if (PROJECT_LINKED_TYPES.has(item.type)) return Boolean(notificationWorkSlug(item));
  if (item.type !== 'push_alert') return false;
  const slug = notificationWorkSlug(item);
  if (!slug) return false;
  if (siriProposalSlugFromTag(item.tag ?? '')) return true;
  return (item.url ?? '').includes('tab=work');
}

export function partitionNotificationsByExistingWork<T extends WorkLinkedNotification>(
  notifications: T[],
  validSlugs: ReadonlySet<string>,
): { kept: T[]; staleSlugs: Set<string> } {
  const kept: T[] = [];
  const staleSlugs = new Set<string>();
  for (const item of notifications) {
    if (!notificationLinksToWork(item)) {
      kept.push(item);
      continue;
    }
    const slug = notificationWorkSlug(item);
    if (!slug || validSlugs.has(slug)) {
      kept.push(item);
      continue;
    }
    staleSlugs.add(slug);
  }
  return { kept, staleSlugs };
}

/** Archive engagement + push alerts tied to a deleted project. */
export async function storeAckNotificationsForDeletedWork(
  slug: string,
): Promise<{ engagement: number; pushAlerts: number }> {
  const trimmed = slug.trim();
  if (!trimmed) return { engagement: 0, pushAlerts: 0 };
  const [engagement, pushAlerts] = await Promise.all([
    storeAckEngagementEventsForJobSlug(trimmed),
    storeAckPushAlertsForWorkSlug(trimmed),
  ]);
  if (engagement > 0 || pushAlerts > 0) scheduleReviewsBadgePush();
  return { engagement, pushAlerts };
}

/** Background heal for notifications left pending after a project was removed. */
export async function healStaleWorkNotificationSlugs(staleSlugs: Iterable<string>): Promise<void> {
  const slugs = [...new Set([...staleSlugs].map((s) => s.trim()).filter(Boolean))];
  if (!slugs.length) return;
  await Promise.all(slugs.map((slug) => storeAckNotificationsForDeletedWork(slug))).catch((e) => {
    console.warn('[notifications] heal stale work links failed', e);
  });
}
