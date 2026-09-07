/**
 * Cal.com booking notes built from archived inbox messages.
 */

import { htmlToPlainText, plainTextForDisplay } from './emailBody';
import { DEFAULT_MEETING_MINUTES } from './bookingDuration';

/** Cal.com booking notes when scheduling from an archived inbox message. */
export const MAX_BOOKING_EMAIL_NOTES = 50_000;

export { DEFAULT_MEETING_MINUTES };

const DEFAULT_BOOKING_TZ = 'America/New_York';

function bookingNotesTimezone(): string {
  return process.env.BOOKING_TIMEZONE?.trim() || DEFAULT_BOOKING_TZ;
}

function resolveEmailBodyForBookingNotes(input: {
  bodyText?: string;
  bodySnippet?: string;
  bodyHtml?: string;
}): string {
  const text = (input.bodyText ?? '').trim();
  if (text) return plainTextForDisplay(text);
  const html = (input.bodyHtml ?? '').trim();
  if (html) return htmlToPlainText(html);
  return (input.bodySnippet ?? '').trim();
}

/**
 * Build booking description/notes from an inbox email so the appointment keeps
 * a full reference after the message leaves the inbox.
 */
export function buildBookingNotesFromEmail(input: {
  from?: string;
  subject?: string;
  receivedAt?: string;
  schedulingNote?: string;
  bodyText?: string;
  bodySnippet?: string;
  bodyHtml?: string;
  vendorLabel?: string | null;
  durationMinutes?: number;
  defaultDurationMinutes?: number;
}): string {
  const lines: string[] = [];

  const vendor = input.vendorLabel?.trim();
  if (vendor) lines.push(`Vendor appointment (${vendor})`);

  const from = (input.from ?? '').trim();
  if (from) lines.push(`From: ${from}`);
  lines.push(`Subject: ${input.subject?.trim() || '(no subject)'}`);

  const receivedAt = input.receivedAt?.trim();
  if (receivedAt) {
    try {
      const label = new Date(receivedAt).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: bookingNotesTimezone(),
      });
      lines.push(`Received: ${label}`);
    } catch {
      // skip malformed timestamps
    }
  }

  const schedulingNote = input.schedulingNote?.trim();
  if (schedulingNote) lines.push(`Requested: ${schedulingNote}`);

  const durationMinutes = input.durationMinutes;
  const defaultDuration = input.defaultDurationMinutes ?? DEFAULT_MEETING_MINUTES;
  if (typeof durationMinutes === 'number' && durationMinutes !== defaultDuration) {
    lines.push(`Duration: ${durationMinutes} minutes`);
  }

  const body = resolveEmailBodyForBookingNotes(input);
  if (body) {
    lines.push('', '--- Email ---', '', body);
  }

  let notes = lines.join('\n').trim();
  if (notes.length > MAX_BOOKING_EMAIL_NOTES) {
    notes = `${notes.slice(0, MAX_BOOKING_EMAIL_NOTES)}\n…[truncated at ${MAX_BOOKING_EMAIL_NOTES} chars]`;
  }
  return notes;
}
