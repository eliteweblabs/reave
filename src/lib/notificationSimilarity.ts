/**
 * Match dashboard review notifications against triage rule phrases so one
 * triage action can resolve similar pending alerts without duplicate rules.
 */

export type NotificationMatchRef = {
  type?: string;
  emailId?: string;
  alertId?: string;
  commentId?: string;
  engagementId?: string;
  title?: string;
  detail?: string;
  subject?: string;
  from?: string;
};

export function notificationContentHaystack(n: NotificationMatchRef): string {
  return [n.subject, n.title, n.detail, n.from].filter(Boolean).join('\n').toLowerCase();
}

export function notificationMatchesPhrases(n: NotificationMatchRef, phrases: string[]): boolean {
  if (!phrases.length) return false;
  const haystack = notificationContentHaystack(n);
  return phrases.some((p) => haystack.includes(p.toLowerCase()));
}

export function notificationIdentityKey(n: NotificationMatchRef): string | null {
  if (n.emailId?.trim()) return `email:${n.emailId.trim()}`;
  if (n.alertId?.trim()) return `alert:${n.alertId.trim()}`;
  if (n.commentId?.trim()) return `comment:${n.commentId.trim()}`;
  if (n.engagementId?.trim()) return `engagement:${n.engagementId.trim()}`;
  return null;
}

export function isSameNotificationIdentity(
  a: NotificationMatchRef,
  b: NotificationMatchRef,
): boolean {
  const ka = notificationIdentityKey(a);
  const kb = notificationIdentityKey(b);
  return Boolean(ka && kb && ka === kb);
}

/** Same notification type and at least one triage phrase match (any mode). */
export function notificationMatchesTriageRule(
  source: NotificationMatchRef,
  candidate: NotificationMatchRef,
  phrases: string[],
): boolean {
  const sourceType = source.type?.trim();
  const candidateType = candidate.type?.trim();
  if (!sourceType || !candidateType || sourceType !== candidateType) return false;
  if (isSameNotificationIdentity(source, candidate)) return false;
  return notificationMatchesPhrases(candidate, phrases);
}

export function matchRefFromTriageInput(input: NotificationMatchRef): NotificationMatchRef {
  return {
    type: input.type,
    emailId: input.emailId,
    alertId: input.alertId,
    commentId: input.commentId,
    engagementId: input.engagementId,
    title: input.title,
    detail: input.detail,
    subject: input.subject,
    from: input.from,
  };
}

export function matchRefFromDashboardNotification(n: {
  type: string;
  emailId?: string;
  alertId?: string;
  commentId?: string;
  engagementId?: string;
  title?: string;
  detail?: string;
  subject?: string;
  from?: string;
  attendeeEmail?: string;
}): NotificationMatchRef {
  return {
    type: n.type,
    emailId: n.emailId,
    alertId: n.alertId,
    commentId: n.commentId,
    engagementId: n.engagementId,
    title: n.title,
    detail: n.detail,
    subject: n.subject,
    from: n.from || n.attendeeEmail,
  };
}
