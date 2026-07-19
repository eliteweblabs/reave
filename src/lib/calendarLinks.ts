/**
 * Calendar (.ics) and maps links for meeting confirmation emails.
 */
import { siteBaseUrl } from './contactApi';

/** Fold iCalendar lines to 75 octets (RFC 5545). */
function foldIcsLine(line: string): string {
  const max = 75;
  if (line.length <= max) return line;
  const parts: string[] = [line.slice(0, max)];
  let i = max;
  while (i < line.length) {
    parts.push(` ${line.slice(i, i + max - 1)}`);
    i += max - 1;
  }
  return parts.join('\r\n');
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** UTC timestamp for ICS fields (YYYYMMDDTHHMMSSZ). */
export function toIcsUtc(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function mapsDirectionsUrl(address: string): string {
  const q = encodeURIComponent(address.trim());
  return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

/** Public .ics download for a Cal.com booking uid. */
export function bookingCalendarUrl(uid: string): string {
  return `${siteBaseUrl()}/api/bookings/${encodeURIComponent(uid)}/calendar.ics`;
}

export function buildBookingIcs(input: {
  uid: string;
  title: string;
  startIso: string;
  endIso: string;
  location?: string | null;
  description?: string | null;
  organizerEmail?: string | null;
  organizerName?: string | null;
}): string | null {
  const dtStart = toIcsUtc(input.startIso);
  const dtEnd = toIcsUtc(input.endIso);
  const dtStamp = toIcsUtc(new Date().toISOString());
  if (!dtStart || !dtEnd || !dtStamp) return null;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Reave//Meeting//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsEscape(`${input.uid}@reave`)}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    foldIcsLine(`SUMMARY:${icsEscape(input.title.trim() || 'Meeting')}`),
  ];

  const location = input.location?.trim();
  if (location) lines.push(foldIcsLine(`LOCATION:${icsEscape(location)}`));

  const description = input.description?.trim();
  if (description) lines.push(foldIcsLine(`DESCRIPTION:${icsEscape(description)}`));

  const orgEmail = input.organizerEmail?.trim();
  if (orgEmail) {
    const orgName = input.organizerName?.trim();
    lines.push(
      orgName
        ? foldIcsLine(`ORGANIZER;CN=${icsEscape(orgName)}:mailto:${orgEmail}`)
        : `ORGANIZER:mailto:${orgEmail}`,
    );
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
