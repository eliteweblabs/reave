/**
 * Email knowledge triage — owner feedback on agent email decisions creates
 * filter rules so future similar mail is handled consistently.
 */

import type { EmailInboxRecord } from './emailInboxStore';
import { storeCreateEmailRule } from './emailRuleStore';
import type { RuleField } from './emailRules';
import { storeWriteKnowledge } from './knowledgeStore';

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

function extractPhrases(record: Pick<EmailInboxRecord, 'subject' | 'summary' | 'status'>): string[] {
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

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function createEmailRuleFromTriageFeedback(opts: {
  record: EmailInboxRecord;
  feedback: EmailTriageFeedbackAction;
  note?: string;
}): Promise<{ ruleId: string | null; knowledgeSlug: string | null }> {
  if (opts.feedback === 'accepted') {
    return { ruleId: null, knowledgeSlug: null };
  }

  const phrases = extractPhrases(opts.record);
  const fields: RuleField[] = ['subject', 'body'];
  let notify = false;
  let status = 'AUTO_ARCHIVED';
  let title = `Triage: ${opts.record.subject?.slice(0, 48) || 'similar mail'}`;
  let description = `Owner triage (${opts.feedback}) from dashboard review`;

  switch (opts.feedback) {
    case 'important':
      notify = true;
      status = 'NEEDS_CHECK';
      title = `Alert: ${opts.record.subject?.slice(0, 48) || 'similar mail'}`;
      description = 'Owner marked similar mail as important — always notify.';
      break;
    case 'ignore':
      notify = false;
      status = 'DELETE';
      title = `Ignore: ${opts.record.subject?.slice(0, 48) || 'similar mail'}`;
      description = 'Owner asked to suppress similar mail.';
      break;
    case 'teach':
      notify = true;
      status = 'NEEDS_CHECK';
      title = `Learned: ${opts.record.subject?.slice(0, 48) || 'similar mail'}`;
      description = opts.note?.trim() || 'Owner taught handling for similar mail.';
      break;
    case 'expected':
    default:
      notify = false;
      status = 'AUTO_ARCHIVED';
      description = 'Owner marked similar mail as expected — log quietly.';
      break;
  }

  let knowledgeSlug: string | null = null;
  if (opts.feedback === 'teach' && opts.note?.trim()) {
    knowledgeSlug = `email-triage-${slugify(opts.record.subject || opts.record.status || 'mail')}-${Date.now().toString(36)}`;
    await storeWriteKnowledge({
      slug: knowledgeSlug,
      title: `Email triage: ${opts.record.subject?.slice(0, 80) || 'similar mail'}`,
      content:
        `# ${opts.record.subject || 'Email triage note'}\n\n` +
        `${opts.note.trim()}\n\n---\n` +
        `Status: ${opts.record.status}\n` +
        `From: ${opts.record.from}\n` +
        `Matched phrases: ${phrases.join(', ')}`,
      tags: ['email-triage', opts.record.category || 'review'],
      source: 'owner',
    });
  }

  const rule = await storeCreateEmailRule({
    title,
    status,
    description,
    phrases,
    matchMode: 'any',
    fields,
    notify,
    enabled: true,
  });

  return { ruleId: rule?.id ?? null, knowledgeSlug };
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
      return 'Auto-file similar mail without notifying you.';
    case 'important':
      return 'Always push and surface similar mail for review.';
    case 'ignore':
      return 'Suppress similar mail entirely.';
    case 'teach':
      return 'Save a note to knowledge and alert for similar cases.';
    default:
      return '';
  }
}
