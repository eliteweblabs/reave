/**
 * POST /api/email/inbox/[id]/triage — owner feedback on agent email decisions.
 * Creates a filter rule and clears the review limbo.
 */

import type { APIContext } from 'astro';
import { storeGetEmailInbox, storeUpdateEmailInbox } from '../../../../../lib/emailInboxStore';
import {
  createEmailRuleFromTriageFeedback,
  type EmailTriageFeedbackAction,
} from '../../../../../lib/emailTriage';
import { isPendingReviewNotification } from '../../../../../lib/emailAutomation';
import { dismissEmailRelatedNotifications } from '../../../../../lib/emailNotificationSync';
import { requireDashboardUser } from '../../../../../lib/dashboardAuth';

export const prerender = false;

const VALID_FEEDBACK = new Set<EmailTriageFeedbackAction>([
  'expected',
  'important',
  'ignore',
  'teach',
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = context.params.id?.trim() ?? '';
  if (!id) return json({ ok: false, error: 'Missing id' }, 400);

  let body: { action?: string; note?: string } = {};
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

  const record = await storeGetEmailInbox(id);
  if (!record) return json({ ok: false, error: 'Not found' }, 404);
  if (!isPendingReviewNotification(record)) {
    return json({ ok: false, error: 'Email is not awaiting agent review' }, 409);
  }
  if (record.automationTriageAt && record.automationAckAt) {
    return json({ ok: true, emailId: id, alreadyResolved: true });
  }

  const { ruleId, knowledgeSlug } = await createEmailRuleFromTriageFeedback({
    record,
    feedback: action,
    note: note || undefined,
  });

  const updated = await storeUpdateEmailInbox(id, {
    automationTriageAction: action,
    automationTriageRuleId: ruleId,
    markAutomationTriage: true,
    markAutomationAck: true,
  });
  if (!updated) return json({ ok: false, error: 'Update failed' }, 500);

  await dismissEmailRelatedNotifications(id, { markAutomationAck: false }).catch(() => undefined);

  return json({
    ok: true,
    emailId: id,
    event: updated,
    ruleId,
    knowledgeSlug,
  });
}
