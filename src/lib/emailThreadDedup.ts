/**
 * Collapse duplicate meeting-request alerts when inbound mail continues an email thread.
 */

import { parseSenderEmail } from './emailAddress';
import { isLikelyEmailReply } from './emailProjectReply';
import { normalizeMessageId } from './emailReply';
import type { EmailInboxRecord } from './emailInboxStore';
import { storeFindInboxByMessageIds, storeListEmailInbox } from './emailInboxStore';

function headerValue(headers: Record<string, string> | undefined, name: string): string {
  if (!headers) return '';
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return String(v).trim();
  }
  return '';
}

/** Message-IDs from In-Reply-To and References (normalized, deduped). */
export function parseThreadReferenceIds(headers?: Record<string, string>): string[] {
  const ids: string[] = [];
  const inReply = headerValue(headers, 'in-reply-to');
  const refs = headerValue(headers, 'references');
  if (inReply) ids.push(normalizeMessageId(inReply));
  for (const token of refs.split(/\s+/)) {
    const norm = normalizeMessageId(token);
    if (norm) ids.push(norm);
  }
  return [...new Set(ids.filter(Boolean))];
}

/** Strip Re:/Fwd:/Aw: prefixes so thread siblings share one key. */
export function normalizeThreadSubject(subject: string): string {
  return subject.replace(/^(?:(?:re|fw|fwd|aw):\s*)+/gi, '').trim().toLowerCase();
}

export function meetingThreadDedupKey(record: Pick<EmailInboxRecord, 'from' | 'subject'>): string {
  const email = parseSenderEmail(record.from).toLowerCase();
  const subj = normalizeThreadSubject(record.subject || '');
  return `${email}\0${subj}`;
}

const MEETING_AUTOMATION_KINDS = new Set(['meeting_request', 'meeting_conflict']);

function priorHasPendingMeetingRequest(prior: EmailInboxRecord): boolean {
  if (prior.bookingUid || prior.automationAckAt) return false;
  if (MEETING_AUTOMATION_KINDS.has(prior.automationKind ?? '')) {
    return Boolean(prior.proposedMeetingStart || prior.schedulingNote);
  }
  if (prior.automationKind || prior.category === 'junk') return false;
  const blob = [prior.summary, prior.subject, prior.schedulingNote].join(' ').toLowerCase();
  const mentionsMeeting = /\b(meet(ing)?|schedule|appointment|call|get together)\b/.test(blob);
  if (prior.proposedMeetingStart || prior.schedulingNote) return mentionsMeeting;
  const mentionsTime =
    /\b(\d{1,2}(:\d{2})?\s*(am|pm|a\.m|p\.m)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
      blob,
    );
  return mentionsMeeting && mentionsTime;
}

/**
 * Find an earlier inbox row in the same email thread (by RFC headers or subject + sender).
 */
export async function findPriorInboxInThread(opts: {
  headers?: Record<string, string>;
  subject: string;
  from: string;
}): Promise<EmailInboxRecord | null> {
  const refIds = parseThreadReferenceIds(opts.headers);
  if (refIds.length > 0) {
    const byMessageId = await storeFindInboxByMessageIds(refIds);
    if (byMessageId) return byMessageId;
  }

  if (!isLikelyEmailReply({ subject: opts.subject, headers: opts.headers })) {
    return null;
  }

  const senderEmail = parseSenderEmail(opts.from).toLowerCase();
  const normSubject = normalizeThreadSubject(opts.subject);
  if (!senderEmail.includes('@') || !normSubject) return null;

  const events = await storeListEmailInbox(200, { hideJunk: true, forDigest: true });
  for (const e of events) {
    if (parseSenderEmail(e.from).toLowerCase() !== senderEmail) continue;
    if (normalizeThreadSubject(e.subject) !== normSubject) continue;
    return e;
  }

  return null;
}

/** Skip a second meeting-request alert when the thread already has one pending review. */
export function shouldSuppressDuplicateMeetingAlert(opts: {
  automationKind: string | null;
  prior: EmailInboxRecord | null;
  proposedMeetingStart?: string | null;
}): boolean {
  if (!opts.prior || !opts.automationKind) return false;
  if (!MEETING_AUTOMATION_KINDS.has(opts.automationKind)) return false;
  if (!priorHasPendingMeetingRequest(opts.prior)) return false;

  // A new concrete time is a meaningful update — still notify.
  if (
    opts.proposedMeetingStart &&
    opts.proposedMeetingStart !== opts.prior.proposedMeetingStart
  ) {
    return false;
  }

  return true;
}
