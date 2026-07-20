/**
 * Dashboard review notifications — automated decisions the owner should confirm.
 */

import type { EmailInboxRecord } from './emailInboxStore';
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
};

export type ReviewNotification =
  | MeetingReviewNotification
  | MeetingFollowupReviewNotification
  | MeetingRequestReviewNotification
  | ProjectReviewNotification;

export function isAutoBookedMeetingPendingReview(
  record: Pick<EmailInboxRecord, 'action' | 'bookingUid' | 'automationAckAt'>,
): boolean {
  return (
    String(record.action || '').toLowerCase() === 'booked' &&
    Boolean(record.bookingUid) &&
    !record.automationAckAt
  );
}

export function isAutoProjectPendingReview(
  record: Pick<EmailInboxRecord, 'automationKind' | 'jobSlug' | 'automationAckAt'>,
): boolean {
  return (
    record.automationKind === 'project_created' &&
    Boolean(record.jobSlug) &&
    !record.automationAckAt
  );
}

export function isMeetingFollowupPendingReview(
  record: Pick<EmailInboxRecord, 'automationKind' | 'bookingUid' | 'automationAckAt'>,
): boolean {
  return (
    record.automationKind === 'meeting_followup' &&
    Boolean(record.bookingUid) &&
    !record.automationAckAt
  );
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
  >,
): boolean {
  if (record.bookingUid || record.automationAckAt) return false;
  if (record.automationKind === 'meeting_request' || record.automationKind === 'meeting_conflict') {
    return Boolean(record.proposedMeetingStart || record.schedulingNote);
  }
  return isLegacyMeetingRequestPendingReview(record);
}

/** Inbox rows ingested before automationKind existed — still need a banner. */
export function isLegacyMeetingRequestPendingReview(
  record: Pick<
    EmailInboxRecord,
    'automationKind' | 'proposedMeetingStart' | 'schedulingNote' | 'bookingUid' | 'automationAckAt' | 'category' | 'summary' | 'subject'
  >,
): boolean {
  if (record.automationKind || record.bookingUid || record.automationAckAt) return false;
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
    isAutoProjectPendingReview(record)
  );
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
