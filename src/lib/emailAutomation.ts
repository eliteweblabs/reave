/**
 * Dashboard review notifications — automated decisions the owner should confirm.
 */

import type { EmailInboxRecord } from './emailInboxStore';
import { attendeeFromEmail, formatMeetingWhenLabel } from './emailScheduling';
import { buildAutoProjectNotificationTitle } from './emailProjectAuto';

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

export type ReviewNotification = MeetingReviewNotification | ProjectReviewNotification;

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

export function isPendingReviewNotification(record: EmailInboxRecord): boolean {
  return isAutoBookedMeetingPendingReview(record) || isAutoProjectPendingReview(record);
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
    if (isAutoBookedMeetingPendingReview(record)) {
      out.push(toMeetingReviewNotification(record));
    } else if (isAutoProjectPendingReview(record)) {
      out.push(toProjectReviewNotification(record));
    }
  }
  return out;
}

export function countReviewNotifications(events: EmailInboxRecord[]): number {
  return listReviewNotifications(events, { limit: 500, maxAgeDays: 14 }).length;
}

/** @deprecated use listReviewNotifications */
export const listMeetingReviewNotifications = listReviewNotifications;
