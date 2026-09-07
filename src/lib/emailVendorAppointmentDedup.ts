/**
 * Auto-archive vendor appointment confirmations when the appointment is already
 * tracked (prior inbox row or calendar booking).
 */

import { parseSenderEmail, parseSenderName } from './emailAddress';
import type { EmailInboxRecord } from './emailInboxStore';
import {
  inboundMeetingEvidence,
  isVendorConfirmedAppointment,
  looksLikeConfirmedAppointment,
} from './emailMeetingParse';

const MEETING_AUTOMATION_KINDS = new Set([
  'meeting_booked',
  'meeting_request',
  'meeting_conflict',
  'meeting_followup',
]);

/** Vendor confirmations without a new time only dedupe against recent handled rows. */
const VENDOR_DEDUPE_LOOKBACK_MS = 21 * 24 * 60 * 60 * 1000;

const DEFAULT_MEETING_MINUTES = 30;

type CalendarBooking = {
  status: string;
  startTime: string;
  endTime: string;
};

export function extractAppointmentConfirmationNumber(text: string): string | null {
  const source = String(text || '');
  const m = source.match(
    /\b(?:confirmation|reference|appointment)\s*(?:number|#|no\.?)\s*:?\s*([A-Z0-9]{6,})\b/i,
  );
  return m?.[1]?.trim().toUpperCase() ?? null;
}

export function vendorAppointmentSenderKey(from: string): string | null {
  const lower = String(from || '').toLowerCase();
  if (/\bbest\s*buy\b|\bbestbuy\b/.test(lower)) return 'bestbuy';
  if (/\bapple\b|\bgenius\s*bar\b/.test(lower)) return 'apple';
  if (/\bbooksy\b/.test(lower)) return 'booksy';

  const email = parseSenderEmail(from).toLowerCase();
  const domain = email.split('@')[1] || '';
  if (!/\b(noreply|no-reply|donotreply|emailinfo|notify|notification)\b/.test(domain)) {
    return null;
  }

  const name = parseSenderName(from).toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (name.length >= 4) return name.slice(0, 32);
  const label = domain.split('.').find((part) => part.length >= 4 && !/^(com|org|net|emailinfo)$/.test(part));
  return label?.slice(0, 32) ?? null;
}

export function vendorKeyFromSchedulingNote(note: string): string | null {
  const text = String(note || '');
  if (/\bbest\s*buy\b|\bgeek\s*squad\b/i.test(text)) return 'bestbuy';
  if (/\bapple\b/i.test(text) && /\bcarry-in\b/i.test(text)) return 'apple';
  if (/\bbooksy\b/i.test(text)) return 'booksy';
  return null;
}

function rowVendorKey(record: Pick<EmailInboxRecord, 'from' | 'schedulingNote' | 'summary'>): string | null {
  return (
    vendorAppointmentSenderKey(record.from) ||
    vendorKeyFromSchedulingNote(record.schedulingNote || '') ||
    vendorKeyFromSchedulingNote(record.summary || '')
  );
}

export function priorVendorAppointmentWasHandled(
  record: Pick<
    EmailInboxRecord,
    'bookingUid' | 'automationAckAt' | 'action' | 'automationKind' | 'proposedMeetingStart' | 'schedulingNote'
  >,
): boolean {
  if (record.bookingUid || record.automationAckAt) return true;
  const action = String(record.action || '').toLowerCase();
  if (action !== 'booked' && action !== 'filed') return false;
  if (MEETING_AUTOMATION_KINDS.has(String(record.automationKind || '').toLowerCase())) return true;
  return Boolean(record.proposedMeetingStart || record.schedulingNote);
}

function timesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.abs(ta - tb) <= 60_000;
}

function priorIsRecentEnough(prior: Pick<EmailInboxRecord, 'receivedAt'>): boolean {
  const t = new Date(prior.receivedAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= VENDOR_DEDUPE_LOOKBACK_MS;
}

function bookingOverlapsTime(bookings: CalendarBooking[], proposedStart: string): boolean {
  const start = new Date(proposedStart);
  if (Number.isNaN(start.getTime())) return false;
  const endMs = start.getTime() + DEFAULT_MEETING_MINUTES * 60 * 1000;
  for (const booking of bookings) {
    const status = String(booking.status || '').toUpperCase();
    if (status === 'CANCELLED' || status === 'REJECTED') continue;
    const bStart = new Date(booking.startTime).getTime();
    const bEnd = new Date(booking.endTime).getTime();
    if (Number.isNaN(bStart) || Number.isNaN(bEnd)) continue;
    if (start.getTime() < bEnd && endMs > bStart) return true;
  }
  return false;
}

export function shouldSuppressDuplicateVendorAppointment(opts: {
  from: string;
  subject: string;
  bodyText?: string | null;
  bodySnippet?: string | null;
  bodyHtml?: string | null;
  proposedMeetingStart?: string | null;
  schedulingNote?: string | null;
  prior: EmailInboxRecord;
}): boolean {
  if (!priorVendorAppointmentWasHandled(opts.prior)) return false;

  const evidence = inboundMeetingEvidence({
    subject: opts.subject,
    bodyText: opts.bodyText,
    bodySnippet: opts.bodySnippet,
    bodyHtml: opts.bodyHtml,
  });
  const priorEvidence = inboundMeetingEvidence({
    subject: opts.prior.subject,
    bodyText: opts.prior.bodyText,
    bodySnippet: opts.prior.bodySnippet,
    bodyHtml: opts.prior.bodyHtml,
  });

  const currentConfirm = extractAppointmentConfirmationNumber(evidence);
  const priorConfirm = extractAppointmentConfirmationNumber(priorEvidence);
  if (currentConfirm && priorConfirm) {
    return currentConfirm === priorConfirm;
  }

  const currentVendor =
    vendorAppointmentSenderKey(opts.from) || vendorKeyFromSchedulingNote(opts.schedulingNote || '');
  const priorVendor = rowVendorKey(opts.prior);
  if (!currentVendor || !priorVendor || currentVendor !== priorVendor) return false;

  if (
    timesMatch(opts.proposedMeetingStart, opts.prior.proposedMeetingStart) ||
    timesMatch(opts.proposedMeetingStart, opts.prior.bookingStart)
  ) {
    return true;
  }

  if (
    !opts.proposedMeetingStart &&
    looksLikeConfirmedAppointment(evidence) &&
    priorIsRecentEnough(opts.prior)
  ) {
    return true;
  }

  return false;
}

export async function findPriorHandledVendorAppointment(opts: {
  from: string;
  subject: string;
  bodyText?: string | null;
  bodySnippet?: string | null;
  bodyHtml?: string | null;
  proposedMeetingStart?: string | null;
  schedulingNote?: string | null;
  headers?: Record<string, string>;
}): Promise<EmailInboxRecord | null> {
  const { findPriorInboxInThread } = await import('./emailThreadDedup');
  const { storeListEmailInbox } = await import('./emailInboxStore');

  const threadPrior = await findPriorInboxInThread({
    headers: opts.headers,
    subject: opts.subject,
    from: opts.from,
  });
  if (threadPrior && shouldSuppressDuplicateVendorAppointment({ ...opts, prior: threadPrior })) {
    return threadPrior;
  }

  const evidence = inboundMeetingEvidence({
    subject: opts.subject,
    bodyText: opts.bodyText,
    bodySnippet: opts.bodySnippet,
    bodyHtml: opts.bodyHtml,
  });
  const currentConfirm = extractAppointmentConfirmationNumber(evidence);
  const currentVendor =
    vendorAppointmentSenderKey(opts.from) || vendorKeyFromSchedulingNote(opts.schedulingNote || '');
  if (!currentConfirm && !currentVendor) return null;

  const events = await storeListEmailInbox(200, { hideJunk: true, forDigest: true });
  for (const prior of events) {
    if (shouldSuppressDuplicateVendorAppointment({ ...opts, prior })) return prior;
  }

  return null;
}

export async function calendarAlreadyHasVendorAppointmentTime(
  proposedMeetingStart: string | null | undefined,
): Promise<boolean> {
  if (!proposedMeetingStart) return false;
  const { bookingList, isBookingConfigured } = await import('./bookingClient');
  if (!isBookingConfigured()) return false;
  const listRes = await bookingList({ upcoming: true, limit: 100 });
  if (!listRes.ok) return false;
  return bookingOverlapsTime(listRes.data.bookings, proposedMeetingStart);
}

export type VendorAppointmentDuplicateDecision = {
  suppress: boolean;
  reason: string;
  priorId?: string;
};

/** True when a vendor confirmation should be archived without review. */
export async function evaluateVendorAppointmentDuplicate(input: {
  from: string;
  subject: string;
  bodyText?: string | null;
  bodySnippet?: string | null;
  bodyHtml?: string | null;
  proposedMeetingStart?: string | null;
  schedulingNote?: string | null;
  headers?: Record<string, string>;
}): Promise<VendorAppointmentDuplicateDecision> {
  if (
    !isVendorConfirmedAppointment({
      from: input.from,
      subject: input.subject,
      bodyText: input.bodyText,
      bodySnippet: input.bodySnippet,
      bodyHtml: input.bodyHtml,
    })
  ) {
    return { suppress: false, reason: '' };
  }

  const prior = await findPriorHandledVendorAppointment(input);
  if (prior) {
    return {
      suppress: true,
      priorId: prior.id,
      reason: prior.bookingUid
        ? 'Vendor appointment already on the calendar — duplicate confirmation archived'
        : 'Vendor appointment already handled — duplicate confirmation archived',
    };
  }

  if (input.proposedMeetingStart && (await calendarAlreadyHasVendorAppointmentTime(input.proposedMeetingStart))) {
    return {
      suppress: true,
      reason: 'Appointment time already on the calendar — duplicate confirmation archived',
    };
  }

  return { suppress: false, reason: '' };
}
