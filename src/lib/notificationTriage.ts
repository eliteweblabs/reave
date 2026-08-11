/**
 * Generalized dashboard notification triage — structured owner feedback on any
 * review alert (email automation, push alerts, comments, engagement, etc.).
 */

import { dismissEmailRelatedNotifications } from './emailNotificationSync';
import { scheduleReviewsBadgePush } from './pushBadgeSync';
import { storeGetEmailInbox, storeListEmailInbox, storeUpdateEmailInbox } from './emailInboxStore';
import { listReviewNotifications } from './emailAutomation';
import { dedupeDashboardNotificationsByEmail } from './dashboardNotificationDedupe';
import {
  createTriageFeedback,
  extractPhrases,
  type EmailTriageFeedbackAction,
  type TriageFeedbackContext,
} from './emailTriage';
import { storeAckEngagementEvent } from './engagementStore';
import { storeAckPushAlert } from './pushAlertStore';
import { storeAckWorkComment } from './workComments';
import { listEngagementNotifications } from './engagementNotifications';
import { listPushAlertNotifications } from './pushAlertNotifications';
import { listProjectCommentNotifications } from './workCommentNotifications';
import {
  matchRefFromDashboardNotification,
  matchRefFromTriageInput,
  notificationMatchesTriageRule,
} from './notificationSimilarity';

export type NotificationTriageInput = {
  action: EmailTriageFeedbackAction;
  note?: string;
  type?: string;
  emailId?: string;
  alertId?: string;
  commentId?: string;
  engagementId?: string;
  title?: string;
  detail?: string;
  subject?: string;
  from?: string;
  url?: string;
};

export type TriageResolvedNotification = {
  type: string;
  emailId?: string;
  alertId?: string;
  commentId?: string;
  engagementId?: string;
};

export function parseEmailIdFromNotificationUrl(url?: string | null): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  try {
    const parsed = raw.includes('://') ? new URL(raw) : new URL(raw, 'https://reave.app');
    const emailId = parsed.searchParams.get('email')?.trim();
    return emailId || null;
  } catch {
    return null;
  }
}

function triageContextFromInput(input: NotificationTriageInput): TriageFeedbackContext {
  return {
    subject: input.subject?.trim() || input.title?.trim() || '',
    summary: input.detail?.trim() || '',
    status: input.type?.trim() || 'NOTIFICATION',
    from: input.from?.trim() || '',
    category: 'review',
    notificationType: input.type?.trim() || undefined,
  };
}

async function listAllPendingDashboardNotifications() {
  const events = await storeListEmailInbox(100, { hideJunk: true });
  const [comments, engagements, pushAlerts] = await Promise.all([
    listProjectCommentNotifications({ limit: 500, maxAgeDays: 14 }),
    listEngagementNotifications({ limit: 500, maxAgeDays: 14 }),
    listPushAlertNotifications({ limit: 500, maxAgeDays: 14 }),
  ]);
  return dedupeDashboardNotificationsByEmail([
    ...listReviewNotifications(events, { limit: 500, maxAgeDays: 14 }),
    ...comments,
    ...engagements,
    ...pushAlerts,
  ]);
}

/** Resolve other pending dashboard alerts that match the triage rule phrases. */
async function resolveSimilarPendingNotifications(opts: {
  source: NotificationTriageInput;
  phrases: string[];
  ruleId: string | null;
  action: EmailTriageFeedbackAction;
}): Promise<TriageResolvedNotification[]> {
  const sourceRef = matchRefFromTriageInput(opts.source);
  const pending = await listAllPendingDashboardNotifications();
  const resolved: TriageResolvedNotification[] = [];

  for (const n of pending) {
    const candidate = matchRefFromDashboardNotification(n);
    if (!notificationMatchesTriageRule(sourceRef, candidate, opts.phrases)) continue;

    if ('emailId' in n && n.emailId) {
      await storeUpdateEmailInbox(n.emailId, {
        automationTriageAction: opts.action,
        automationTriageRuleId: opts.ruleId,
        markAutomationTriage: true,
        markAutomationAck: true,
      }).catch(() => undefined);
      await dismissEmailRelatedNotifications(n.emailId, { markAutomationAck: false }).catch(
        () => undefined,
      );
      resolved.push({ type: n.type, emailId: n.emailId });
    } else if ('alertId' in n && n.alertId) {
      await storeAckPushAlert(n.alertId).catch(() => undefined);
      resolved.push({ type: n.type, alertId: n.alertId });
    } else if ('commentId' in n && n.commentId) {
      await storeAckWorkComment(n.commentId).catch(() => undefined);
      resolved.push({ type: n.type, commentId: n.commentId });
    } else if ('engagementId' in n && n.engagementId) {
      await storeAckEngagementEvent(n.engagementId).catch(() => undefined);
      resolved.push({ type: n.type, engagementId: n.engagementId });
    }
  }

  return resolved;
}

/** Apply owner triage feedback and dismiss the source notification. */
export async function triageNotification(
  input: NotificationTriageInput,
): Promise<{
  ok: true;
  emailId: string | null;
  ruleId: string | null;
  knowledgeSlug: string | null;
  alsoResolved: TriageResolvedNotification[];
  event?: Awaited<ReturnType<typeof storeUpdateEmailInbox>>;
}> {
  const emailId =
    input.emailId?.trim() || parseEmailIdFromNotificationUrl(input.url) || null;

  const record = emailId ? await storeGetEmailInbox(emailId) : null;
  const triageContext: TriageFeedbackContext = record
    ? { ...record, notificationType: input.type }
    : triageContextFromInput(input);

  let ruleId: string | null = null;
  let knowledgeSlug: string | null = null;
  let event: Awaited<ReturnType<typeof storeUpdateEmailInbox>> | undefined;

  if (record) {
    ({ ruleId, knowledgeSlug } = await createTriageFeedback({
      context: { ...record, notificationType: input.type },
      feedback: input.action,
      note: input.note,
    }));
    event = await storeUpdateEmailInbox(emailId!, {
      automationTriageAction: input.action,
      automationTriageRuleId: ruleId,
      markAutomationTriage: true,
      markAutomationAck: true,
    }).catch(() => null);
    if (event === null) event = undefined;
    await dismissEmailRelatedNotifications(emailId!, { markAutomationAck: false }).catch(
      () => undefined,
    );
  } else {
    ({ ruleId, knowledgeSlug } = await createTriageFeedback({
      context: triageContextFromInput(input),
      feedback: input.action,
      note: input.note,
    }));
  }

  const alertId = input.alertId?.trim();
  if (alertId) {
    await storeAckPushAlert(alertId).catch(() => undefined);
  }

  const commentId = input.commentId?.trim();
  if (commentId) {
    await storeAckWorkComment(commentId).catch(() => undefined);
  }

  const engagementId = input.engagementId?.trim();
  if (engagementId) {
    await storeAckEngagementEvent(engagementId).catch(() => undefined);
  }

  const phrases = extractPhrases(triageContext);
  const alsoResolved = await resolveSimilarPendingNotifications({
    source: input,
    phrases,
    ruleId,
    action: input.action,
  });

  scheduleReviewsBadgePush();
  return { ok: true, emailId, ruleId, knowledgeSlug, alsoResolved, event: event ?? undefined };
}
