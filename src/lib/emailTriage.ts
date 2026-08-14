/**
 * Email knowledge triage — owner feedback on agent email decisions creates
 * filter rules so future similar mail is handled consistently.
 */

import type { EmailInboxRecord } from './emailInboxStore';
import { suggestRuleDraftFromEmail } from './emailRuleDraft';
import { storeCreateEmailRule } from './emailRuleStore';
import type { RuleField } from './emailRules';
import { storeWriteKnowledge } from './knowledgeStore';

export type { RuleDraftSource, SuggestedRuleDraft } from './emailRuleDraft';
export { parseFromAddress, suggestRuleDraftFromEmail } from './emailRuleDraft';

export type EmailTriageFeedbackAction = 'expected' | 'important' | 'ignore' | 'teach' | 'accepted';

const EMAIL_AUTOMATION_TYPES = new Set([
  'meeting',
  'meeting_request',
  'meeting_conflict',
  'meeting_followup',
  'project',
  'project_match',
]);

export function isEmailAutomationReviewType(type: string): boolean {
  return EMAIL_AUTOMATION_TYPES.has(type);
}

export function isEmailAwaitingTriage(
  record: Pick<EmailInboxRecord, 'automationAckAt' | 'automationTriageAt'>,
  pendingReview: boolean,
): boolean {
  return pendingReview && !record.automationTriageAt && !record.automationAckAt;
}

const STOP_WORDS = new Set([
  'about',
  'after',
  'before',
  'could',
  'email',
  'from',
  'have',
  'https',
  'please',
  'reply',
  'subject',
  'thank',
  'that',
  'their',
  'there',
  'these',
  'this',
  'with',
  'would',
  'your',
]);

export function extractPhrases(record: Pick<EmailInboxRecord, 'subject' | 'summary' | 'status'>): string[] {
  const blob = [record.subject, record.summary].filter(Boolean).join(' ');
  const words = blob
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
  const unique = [...new Set(words)].slice(0, 4);
  if (unique.length) return unique;
  const status = record.status?.trim();
  if (status && status !== 'UNMATCHED') return [status.toLowerCase()];
  const subject = record.subject?.trim();
  if (subject && subject.length >= 4) return [subject.slice(0, 60).toLowerCase()];
  return ['inbound mail'];
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export type TriageFeedbackContext = Pick<
  EmailInboxRecord,
  'subject' | 'summary' | 'status' | 'from' | 'category'
> & {
  /** Dashboard notification type (push_alert, project_comment, …). */
  notificationType?: string;
};

export async function createTriageFeedback(opts: {
  context: TriageFeedbackContext;
  feedback: EmailTriageFeedbackAction;
  note?: string;
}): Promise<{ ruleId: string | null; knowledgeSlug: string | null }> {
  if (opts.feedback === 'accepted') {
    return { ruleId: null, knowledgeSlug: null };
  }

  const ctx = opts.context;
  const draft = suggestRuleDraftFromEmail(ctx);
  const phrases = draft?.phrases.length ? draft.phrases : extractPhrases(ctx);
  const fields: RuleField[] = draft?.fields?.length ? draft.fields : ['subject', 'body'];
  let notify = false;
  let status = 'AUTO_ARCHIVED';
  const label = draft?.title || ctx.subject?.slice(0, 48) || ctx.summary?.slice(0, 48) || 'similar cases';
  let title = `Triage: ${label}`;
  let description = draft?.description || `Owner triage (${opts.feedback}) from dashboard review`;

  const withEmailRecap = (lead: string) =>
    [lead, draft?.description].filter(Boolean).join('\n\n');

  switch (opts.feedback) {
    case 'important':
      notify = true;
      status = 'NEEDS_CHECK';
      title = `Alert: ${label}`;
      description = withEmailRecap('Owner marked similar cases as important — always notify.');
      break;
    case 'ignore':
      notify = false;
      status = 'DELETE';
      title = `Ignore: ${label}`;
      description = withEmailRecap('Owner asked to suppress similar cases.');
      break;
    case 'teach':
      notify = true;
      status = 'NEEDS_CHECK';
      title = `Learned: ${label}`;
      description = withEmailRecap(opts.note?.trim() || 'Owner taught handling for similar cases.');
      break;
    case 'expected':
    default:
      notify = false;
      status = 'AUTO_ARCHIVED';
      description = withEmailRecap('Owner marked similar cases as expected — log quietly.');
      break;
  }

  let knowledgeSlug: string | null = null;
  if (opts.feedback === 'teach' && opts.note?.trim()) {
    const slugBase = ctx.subject || ctx.summary || ctx.status || 'notification';
    knowledgeSlug = `notification-triage-${slugify(slugBase)}-${Date.now().toString(36)}`;
    const tags = ['notification-triage', ctx.category || 'review'];
    if (ctx.notificationType) tags.push(ctx.notificationType);
    await storeWriteKnowledge({
      slug: knowledgeSlug,
      title: `Notification triage: ${ctx.subject?.slice(0, 80) || label}`,
      content:
        `# ${ctx.subject || 'Notification triage note'}\n\n` +
        `${opts.note.trim()}\n\n---\n` +
        (ctx.notificationType ? `Type: ${ctx.notificationType}\n` : '') +
        `Status: ${ctx.status}\n` +
        `From: ${ctx.from}\n` +
        `Summary: ${ctx.summary || ''}\n` +
        `Matched phrases: ${phrases.join(', ')}`,
      tags,
      source: 'owner',
    });
  }

  const rule = await storeCreateEmailRule({
    title,
    status,
    description,
    phrases,
    matchMode: draft?.matchMode || 'any',
    fields,
    notify,
    enabled: true,
    scope: 'personal',
  });

  return { ruleId: rule?.id ?? null, knowledgeSlug };
}

export async function createEmailRuleFromTriageFeedback(opts: {
  record: EmailInboxRecord;
  feedback: EmailTriageFeedbackAction;
  note?: string;
}): Promise<{ ruleId: string | null; knowledgeSlug: string | null }> {
  return createTriageFeedback({
    context: opts.record,
    feedback: opts.feedback,
    note: opts.note,
  });
}

export function feedbackActionLabel(action: EmailTriageFeedbackAction): string {
  switch (action) {
    case 'expected':
      return 'Expected — quiet next time';
    case 'important':
      return 'Important — always alert me';
    case 'ignore':
      return 'Ignore similar';
    case 'teach':
      return 'Teach the agent';
    case 'accepted':
      return 'Accepted';
    default:
      return action;
  }
}

export function feedbackActionDescription(action: EmailTriageFeedbackAction): string {
  switch (action) {
    case 'expected':
      return 'Auto-file similar mail without notifying you (creates a quiet rule).';
    case 'important':
      return 'Always push and surface similar mail for review (creates an alert rule).';
    case 'ignore':
      return 'Suppress similar mail entirely (creates a silent DELETE rule).';
    case 'teach':
      return 'Save a note to knowledge and create an alert rule for similar cases.';
    default:
      return '';
  }
}
