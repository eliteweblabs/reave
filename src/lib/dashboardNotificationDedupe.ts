/**
 * One inbound email must never produce multiple dashboard review banners.
 * Triage ("Uncertain classification") and meeting/project automation reviews
 * are built from independent stores — collapse them here by emailId.
 */

export type DashboardNotificationLike = {
  emailId?: string | null;
  type?: string | null;
  alertKind?: string | null;
  tag?: string | null;
  id?: string | null;
  receivedAt?: string | null;
};

const EMAIL_AUTOMATION_TYPES = new Set([
  'meeting',
  'meeting_request',
  'meeting_conflict',
  'meeting_followup',
  'project',
  'project_match',
  'receipt_expense',
]);

function isTriagePushAlert(n: DashboardNotificationLike): boolean {
  if (n.alertKind === 'triage') return true;
  const tag = String(n.tag || '').toLowerCase();
  if (tag.startsWith('triage-')) return true;
  return false;
}

/** Higher rank wins when several notifications share an emailId. */
export function dashboardNotificationRank(n: DashboardNotificationLike): number {
  if (isTriagePushAlert(n)) return 100;
  if (n.type && EMAIL_AUTOMATION_TYPES.has(n.type)) return 80;
  if (n.type === 'push_alert' && n.emailId) return 40;
  if (n.emailId) return 20;
  return 0;
}

/**
 * Keep at most one dashboard notification per inbox emailId.
 * Notifications without an emailId are left untouched.
 */
export function dedupeDashboardNotificationsByEmail<T extends DashboardNotificationLike>(
  notifications: T[],
): T[] {
  const bestByEmail = new Map<string, { index: number; rank: number; receivedAt: number }>();

  for (let i = 0; i < notifications.length; i++) {
    const n = notifications[i]!;
    const emailId = typeof n.emailId === 'string' ? n.emailId.trim() : '';
    if (!emailId) continue;

    const rank = dashboardNotificationRank(n);
    const receivedAt = n.receivedAt ? new Date(n.receivedAt).getTime() : 0;
    const prev = bestByEmail.get(emailId);
    if (
      !prev ||
      rank > prev.rank ||
      (rank === prev.rank && receivedAt > prev.receivedAt)
    ) {
      bestByEmail.set(emailId, { index: i, rank, receivedAt });
    }
  }

  if (bestByEmail.size === 0) return notifications;

  const keepIndexes = new Set<number>();
  for (const { index } of bestByEmail.values()) keepIndexes.add(index);

  return notifications.filter((n, i) => {
    const emailId = typeof n.emailId === 'string' ? n.emailId.trim() : '';
    if (!emailId) return true;
    return keepIndexes.has(i);
  });
}
