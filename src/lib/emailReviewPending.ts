/**
 * Which inbox rows still owe the owner a decision (the dashboard review cards).
 * Predicates only — no stores, no Cal.com, no AI — so they stay testable.
 */

import type { EmailInboxRecord } from './emailInboxStore';
import {
  inboundHasClockTime,
  inboundMeetingEvidence,
  looksLikeMeetingIntent,
} from './emailMeetingParse';

const MEETING_AUTOMATION_KINDS = new Set([
  'meeting_booked',
  'meeting_request',
  'meeting_conflict',
  'meeting_followup',
]);

/**
 * Calendar-affecting automations always earn a dashboard card and a phone push,
 * even when no keyword rule matched — a missed appointment cannot be undone.
 */
export function isMeetingAutomationKind(kind: string | null | undefined): boolean {
  return MEETING_AUTOMATION_KINDS.has(String(kind || '').trim().toLowerCase());
}

/** Inbound mail likely belongs on an existing project — owner should confirm merge. */
export function isSuggestedProjectMatch(
  record: Pick<EmailInboxRecord, 'action' | 'jobSlug' | 'category' | 'automationKind'>,
): boolean {
  if (!record.jobSlug?.trim()) return false;
  const action = String(record.action || '').toLowerCase();
  if (action === 'filed' || action === 'project_reply') return false;
  if (record.automationKind === 'project_created') return false;
  if (action === 'matched') return true;
  return action === 'review' && record.category === 'client';
}

export function isProjectMatchSuggestedPendingReview(
  record: Pick<
    EmailInboxRecord,
    'action' | 'jobSlug' | 'category' | 'automationKind' | 'automationAckAt'
  >,
): boolean {
  if (isNeedsExplainAction(record)) return false;
  return isSuggestedProjectMatch(record) && !record.automationAckAt;
}

export function isAutoBookedMeetingPendingReview(
  record: Pick<EmailInboxRecord, 'action' | 'bookingUid' | 'automationAckAt'>,
): boolean {
  if (isNeedsExplainAction(record)) return false;
  return (
    String(record.action || '').toLowerCase() === 'booked' &&
    Boolean(record.bookingUid) &&
    !record.automationAckAt
  );
}

export function isAutoProjectPendingReview(
  record: Pick<EmailInboxRecord, 'automationKind' | 'jobSlug' | 'automationAckAt' | 'action'>,
): boolean {
  if (isNeedsExplainAction(record)) return false;
  return (
    record.automationKind === 'project_created' &&
    Boolean(record.jobSlug) &&
    !record.automationAckAt
  );
}

export function isMeetingFollowupPendingReview(
  record: Pick<EmailInboxRecord, 'automationKind' | 'bookingUid' | 'automationAckAt' | 'action'>,
): boolean {
  if (isNeedsExplainAction(record)) return false;
  return (
    record.automationKind === 'meeting_followup' &&
    Boolean(record.bookingUid) &&
    !record.automationAckAt
  );
}

function isNeedsExplainAction(
  record: Pick<EmailInboxRecord, 'action'> | { action?: string | null },
): boolean {
  return String(record.action || '').toLowerCase() === 'needs_explain';
}

export function isMeetingRequestPendingReview(
  record: Pick<
    EmailInboxRecord,
    | 'automationKind'
    | 'proposedMeetingStart'
    | 'schedulingNote'
    | 'bookingUid'
    | 'automationAckAt'
    | 'category'
    | 'summary'
    | 'subject'
    | 'action'
    | 'bodyText'
    | 'bodySnippet'
  >,
): boolean {
  if (record.bookingUid || record.automationAckAt) return false;
  // Uncertain classification owns the dashboard slot (Explain) — never also Confirm.
  if (isNeedsExplainAction(record)) return false;
  if (
    record.category === 'alert' ||
    record.category === 'junk' ||
    record.category === 'auto_deleted' ||
    record.category === 'receipt'
  ) {
    return false;
  }
  const evidence = inboundMeetingEvidence({
    subject: record.subject,
    bodyText: record.bodyText,
    bodySnippet: record.bodySnippet,
  });
  if (!inboundHasClockTime(evidence) || !looksLikeMeetingIntent(evidence)) return false;
  if (record.automationKind === 'meeting_request' || record.automationKind === 'meeting_conflict') {
    return Boolean(record.proposedMeetingStart || record.schedulingNote);
  }
  return isLegacyMeetingRequestPendingReview(record);
}

/** Inbox rows ingested before automationKind existed — still need a banner. */
export function isLegacyMeetingRequestPendingReview(
  record: Pick<
    EmailInboxRecord,
    | 'automationKind'
    | 'proposedMeetingStart'
    | 'schedulingNote'
    | 'bookingUid'
    | 'automationAckAt'
    | 'category'
    | 'summary'
    | 'subject'
    | 'action'
    | 'bodyText'
    | 'bodySnippet'
  >,
): boolean {
  if (record.automationKind || record.bookingUid || record.automationAckAt) return false;
  if (isNeedsExplainAction(record)) return false;
  if (record.category === 'junk' || record.category === 'auto_deleted' || record.category === 'alert') {
    return false;
  }
  const evidence = inboundMeetingEvidence({
    subject: record.subject,
    bodyText: record.bodyText,
    bodySnippet: record.bodySnippet,
  });
  if (!looksLikeMeetingIntent(evidence) || !inboundHasClockTime(evidence)) return false;
  return Boolean(record.proposedMeetingStart || record.schedulingNote);
}

export function isPendingReviewNotification(record: EmailInboxRecord): boolean {
  return (
    isAutoBookedMeetingPendingReview(record) ||
    isMeetingFollowupPendingReview(record) ||
    isMeetingRequestPendingReview(record) ||
    isAutoProjectPendingReview(record) ||
    isProjectMatchSuggestedPendingReview(record)
  );
}
