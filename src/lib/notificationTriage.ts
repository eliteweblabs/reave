/**
 * Generalized dashboard notification triage — structured owner feedback on any
 * review alert (email automation, push alerts, comments, engagement, etc.).
 */

import { dismissEmailRelatedNotifications } from './emailNotificationSync';
import { storeGetEmailInbox, storeUpdateEmailInbox } from './emailInboxStore';
import {
  createTriageFeedback,
  type EmailTriageFeedbackAction,
  type TriageFeedbackContext,
} from './emailTriage';
import { storeAckEngagementEvent } from './engagementStore';
import { storeAckPushAlert } from './pushAlertStore';
import { storeAckWorkComment } from './workComments';

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

/** Apply owner triage feedback and dismiss the source notification. */
export async function triageNotification(
  input: NotificationTriageInput,
): Promise<{
  ok: true;
  emailId: string | null;
  ruleId: string | null;
  knowledgeSlug: string | null;
  event?: Awaited<ReturnType<typeof storeUpdateEmailInbox>>;
}> {
  const emailId =
    input.emailId?.trim() || parseEmailIdFromNotificationUrl(input.url) || null;

  let ruleId: string | null = null;
  let knowledgeSlug: string | null = null;
  let event: Awaited<ReturnType<typeof storeUpdateEmailInbox>> | undefined;

  const record = emailId ? await storeGetEmailInbox(emailId) : null;
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

  return { ok: true, emailId, ruleId, knowledgeSlug, event: event ?? undefined };
}
