/**
 * POST /api/admin/notifications/triage — structured owner feedback on any
 * dashboard review notification.
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { json } from '../../../../lib/apiJson';
import {
  triageNotification,
  parseEmailIdFromNotificationUrl,
  type NotificationTriageInput,
} from '../../../../lib/notificationTriage';
import type { EmailTriageFeedbackAction } from '../../../../lib/emailTriage';
import { extractMonetaryAmountFromEmail } from '../../../../lib/emailMoney';

export const prerender = false;

const VALID_FEEDBACK = new Set<EmailTriageFeedbackAction>([
  'expected',
  'important',
  'ignore',
  'teach',
]);

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let body: {
    action?: string;
    note?: string;
    notification?: Partial<NotificationTriageInput>;
  } = {};
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const action = body.action?.trim() as EmailTriageFeedbackAction;
  if (!action || !VALID_FEEDBACK.has(action)) {
    return json({ ok: false, error: 'Invalid triage action' }, 400);
  }

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '';
  const n = body.notification ?? {};
  const input: NotificationTriageInput = {
    action,
    note: note || undefined,
    type: typeof n.type === 'string' ? n.type.trim() : undefined,
    emailId: typeof n.emailId === 'string' ? n.emailId.trim() : undefined,
    alertId: typeof n.alertId === 'string' ? n.alertId.trim() : undefined,
    commentId: typeof n.commentId === 'string' ? n.commentId.trim() : undefined,
    engagementId: typeof n.engagementId === 'string' ? n.engagementId.trim() : undefined,
    title: typeof n.title === 'string' ? n.title.trim() : undefined,
    detail: typeof n.detail === 'string' ? n.detail.trim() : undefined,
    subject: typeof n.subject === 'string' ? n.subject.trim() : undefined,
    from: typeof n.from === 'string' ? n.from.trim() : undefined,
    url: typeof n.url === 'string' ? n.url.trim() : undefined,
  };

  const hasTarget =
    input.emailId ||
    input.alertId ||
    input.commentId ||
    input.engagementId ||
    input.title ||
    input.detail ||
    parseEmailIdFromNotificationUrl(input.url);
  if (!hasTarget) {
    return json({ ok: false, error: 'Notification context required' }, 400);
  }

  const result = await triageNotification(input);
  const event = result.event;
  const monetaryAmount = event ? extractMonetaryAmountFromEmail(event) : null;

  return json({
    ok: true,
    emailId: result.emailId,
    ruleId: result.ruleId,
    knowledgeSlug: result.knowledgeSlug,
    alsoResolved: result.alsoResolved,
    ...(event
      ? {
          event: {
            ...event,
            monetaryAmount,
            hasMonetaryValue: monetaryAmount != null,
          },
        }
      : {}),
  });
}
