/**
 * Dashboard review notifications — automated decisions the owner should confirm.
 */

import type { EmailInboxRecord } from './emailInboxStore';
import { isEmailAwaitingTriage } from './emailTriage';
import { attendeeFromEmail, formatMeetingWhenLabel, resolveProposedMeetingStart } from './emailScheduling';
import { buildAutoProjectNotificationTitle } from './emailProjectAuto';
import { buildMeetingFollowupNotificationTitle } from './emailMeetingFollowup';
import { meetingThreadDedupKey } from './emailThreadDedup';

export type MeetingReviewNotification = {
  id: string;
  type: 'meeting';
  title: string;
  detail: string;
  subject: string;
  from: string;
  receivedAt: string;
  emailId: string;
  bookingUid: string;
  bookingStart: string;
  whenLabel: string;
  attendeeName: string;
  attendeeEmail: string;
  jobSlug: string | null;
  awaitingTriage: boolean;
};

export type ProjectReviewNotification = {
  id: string;
  type: 'project';
  title: string;
  detail: string;
  subject: string;
  from: string;
  receivedAt: string;
  emailId: string;
  jobSlug: string;
  jobTitle: string;
  contactName: string | null;
  awaitingTriage: boolean;
};

export type ProjectMatchSuggestedReviewNotification = {
  id: string;
  type: 'project_match';
  title: string;
  detail: string;
  subject: string;
  from: string;
  receivedAt: string;
  emailId: string;
  jobSlug: string;
  jobTitle: string;
  contactName: string | null;
  attachmentCount: number;
  awaitingTriage: boolean;
};

export type MeetingFollowupReviewNotification = {
  id: string;
  type: 'meeting_followup';
  title: string;
  detail: string;
  subject: string;
  from: string;
  receivedAt: string;
  emailId: string;
  bookingUid: string;
  bookingStart: string;
  whenLabel: string;
  attendeeName: string;
  attendeeEmail: string;
  awaitingTriage: boolean;
};

export type MeetingRequestReviewNotification = {
  id: string;
  type: 'meeting_request' | 'meeting_conflict';
  title: string;
  detail: string;
  subject: string;
  from: string;
  receivedAt: string;
  emailId: string;
  proposedMeetingStart: string | null;
  whenLabel: string;
  attendeeName: string;
  attendeeEmail: string;
  awaitingTriage: boolean;
};

export type ReviewNotification =
  | MeetingReviewNotification
  | MeetingFollowupReviewNotification
  | MeetingRequestReviewNotification
  | ProjectReviewNotification
  | ProjectMatchSuggestedReviewNotification;

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
  >,
): boolean {
  if (record.bookingUid || record.automationAckAt) return false;
  // Uncertain classification owns the dashboard slot (Explain) — never also Confirm.
  if (isNeedsExplainAction(record)) return false;
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
  >,
): boolean {
  if (record.automationKind || record.bookingUid || record.automationAckAt) return false;
  if (isNeedsExplainAction(record)) return false;
  if (record.category === 'junk') return false;
  const blob = [record.summary, record.subject, record.schedulingNote].join(' ').toLowerCase();
  const mentionsMeeting = /\b(meet(ing)?|schedule|appointment|call|get together)\b/.test(blob);
  const mentionsTime =
    /\b(\d{1,2}(:\d{2})?\s*(am|pm|a\.m|p\.m)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
      blob,
    );
  if (record.proposedMeetingStart || record.schedulingNote) {
    return mentionsMeeting;
  }
  return mentionsMeeting && mentionsTime;
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

function awaitingTriageFor(record: EmailInboxRecord): boolean {
  return isEmailAwaitingTriage(record, isPendingReviewNotification(record));
}

function meetingDetail(record: EmailInboxRecord): string {
  const who = record.contactName || record.from || 'Guest';
  const subject = record.subject || '(no subject)';
  return `${who} · ${subject}`;
}

export function toMeetingReviewNotification(record: EmailInboxRecord): MeetingReviewNotification {
  const whenIso = record.bookingStart || record.proposedMeetingStart || record.receivedAt;
  const whenLabel = formatMeetingWhenLabel(whenIso);
  const attendee = attendeeFromEmail({ from: record.from, contactName: record.contactName });
  return {
    id: record.id,
    type: 'meeting',
    title: `Meeting scheduled automatically for ${whenLabel}`,
    detail: meetingDetail(record),
    subject: record.subject || '(no subject)',
    from: record.from || '',
    receivedAt: record.receivedAt,
    emailId: record.id,
    bookingUid: record.bookingUid!,
    bookingStart: record.bookingStart || whenIso,
    whenLabel,
    attendeeName: attendee.name,
    attendeeEmail: attendee.email,
    jobSlug: record.jobSlug,
    awaitingTriage: awaitingTriageFor(record),
  };
}

export function toMeetingFollowupReviewNotification(
  record: EmailInboxRecord,
): MeetingFollowupReviewNotification {
  const whenIso = record.bookingStart || record.proposedMeetingStart || record.receivedAt;
  const whenLabel = formatMeetingWhenLabel(whenIso);
  const attendee = attendeeFromEmail({ from: record.from, contactName: record.contactName });
  const title = buildMeetingFollowupNotificationTitle({
    contactName: record.contactName,
    from: record.from,
  });

  return {
    id: record.id,
    type: 'meeting_followup',
    title,
    detail: `${whenLabel} · ${record.subject || '(no subject)'}`,
    subject: record.subject || '(no subject)',
    from: record.from || '',
    receivedAt: record.receivedAt,
    emailId: record.id,
    bookingUid: record.bookingUid!,
    bookingStart: record.bookingStart || whenIso,
    whenLabel,
    attendeeName: attendee.name,
    attendeeEmail: attendee.email,
    awaitingTriage: awaitingTriageFor(record),
  };
}

function displayFirstName(input: { contactName?: string | null; from: string }): string {
  const attendee = attendeeFromEmail(input);
  const raw = (input.contactName || attendee.name || '').trim();
  if (!raw) return 'Client';
  return raw.split(/\s+/)[0] || 'Client';
}

export function toMeetingRequestReviewNotification(
  record: EmailInboxRecord,
): MeetingRequestReviewNotification {
  const resolvedStart =
    record.proposedMeetingStart ||
    resolveProposedMeetingStart({
      proposedMeetingStart: null,
      schedulingNote: record.schedulingNote,
      summary: record.summary,
      bodyText: record.bodySnippet,
      receivedAt: record.receivedAt,
    });
  const whenIso = resolvedStart || record.receivedAt;
  const whenLabel = resolvedStart
    ? formatMeetingWhenLabel(whenIso)
    : record.schedulingNote || 'time TBD';
  const attendee = attendeeFromEmail({ from: record.from, contactName: record.contactName });
  const who = displayFirstName({ contactName: record.contactName, from: record.from });
  const isConflict = record.automationKind === 'meeting_conflict';
  const title = isConflict
    ? `${who} requested ${whenLabel} — time slot is booked.`
    : `${who} requested a meeting for ${whenLabel}.`;

  return {
    id: record.id,
    type: isConflict ? 'meeting_conflict' : 'meeting_request',
    title,
    detail: meetingDetail(record),
    subject: record.subject || '(no subject)',
    from: record.from || '',
    receivedAt: record.receivedAt,
    emailId: record.id,
    proposedMeetingStart: resolvedStart,
    whenLabel,
    attendeeName: attendee.name,
    attendeeEmail: attendee.email,
    awaitingTriage: awaitingTriageFor(record),
  };
}

export function toProjectMatchSuggestedReviewNotification(
  record: EmailInboxRecord,
): ProjectMatchSuggestedReviewNotification {
  const jobTitle = record.jobTitle || record.jobSlug || 'Project';
  const attachmentCount = Array.isArray(record.attachments) ? record.attachments.length : 0;
  const attachmentBit =
    attachmentCount > 0
      ? `${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}`
      : 'no attachments';
  return {
    id: record.id,
    type: 'project_match',
    title: `Possible match: ${jobTitle}`,
    detail: `Add this email's content and ${attachmentBit} to the project?`,
    subject: record.subject || '(no subject)',
    from: record.from || '',
    receivedAt: record.receivedAt,
    emailId: record.id,
    jobSlug: record.jobSlug!,
    jobTitle,
    contactName: record.contactName,
    attachmentCount,
    awaitingTriage: awaitingTriageFor(record),
  };
}

export function toProjectReviewNotification(record: EmailInboxRecord): ProjectReviewNotification {
  const title = buildAutoProjectNotificationTitle({
    contactName: record.contactName,
    from: record.from,
    summary: record.summary || '',
    subject: record.subject || '',
  });

  return {
    id: record.id,
    type: 'project',
    title,
    detail: record.jobTitle || record.jobSlug || 'Project',
    subject: record.subject || '(no subject)',
    from: record.from || '',
    receivedAt: record.receivedAt,
    emailId: record.id,
    jobSlug: record.jobSlug!,
    jobTitle: record.jobTitle || record.jobSlug!,
    contactName: record.contactName,
    awaitingTriage: awaitingTriageFor(record),
  };
}

export function listReviewNotifications(
  events: EmailInboxRecord[],
  opts?: { limit?: number; maxAgeDays?: number },
): ReviewNotification[] {
  const limit = opts?.limit ?? 20;
  const maxAgeMs = (opts?.maxAgeDays ?? 14) * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAgeMs;

  const pending = events
    .filter((e) => isPendingReviewNotification(e))
    .filter((e) => new Date(e.receivedAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

  const out: ReviewNotification[] = [];
  for (const record of pending) {
    if (out.length >= limit) break;
    if (isMeetingRequestPendingReview(record) && isDuplicateMeetingRequestReview(record, pending)) {
      continue;
    }
    if (isAutoBookedMeetingPendingReview(record)) {
      out.push(toMeetingReviewNotification(record));
    } else if (isMeetingFollowupPendingReview(record)) {
      out.push(toMeetingFollowupReviewNotification(record));
    } else if (isMeetingRequestPendingReview(record)) {
      out.push(toMeetingRequestReviewNotification(record));
    } else if (isAutoProjectPendingReview(record)) {
      out.push(toProjectReviewNotification(record));
    } else if (isProjectMatchSuggestedPendingReview(record)) {
      out.push(toProjectMatchSuggestedReviewNotification(record));
    }
  }
  return out;
}

export function countReviewNotifications(events: EmailInboxRecord[]): number {
  return listReviewNotifications(events, { limit: 500, maxAgeDays: 14 }).length;
}

/** Hide younger duplicates in the same email thread (keeps oldest pending banner). */
export function isDuplicateMeetingRequestReview(
  record: EmailInboxRecord,
  allPending: EmailInboxRecord[],
): boolean {
  if (!isMeetingRequestPendingReview(record)) return false;

  const key = meetingThreadDedupKey(record);
  const sameThread = allPending.filter(
    (r) => isMeetingRequestPendingReview(r) && meetingThreadDedupKey(r) === key,
  );
  if (sameThread.length <= 1) return false;

  const oldest = sameThread.reduce((a, b) =>
    new Date(a.receivedAt).getTime() <= new Date(b.receivedAt).getTime() ? a : b,
  );
  return record.id !== oldest.id;
}

/** @deprecated use listReviewNotifications */
export const listMeetingReviewNotifications = listReviewNotifications;
