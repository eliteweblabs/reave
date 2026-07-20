/**
 * Ensure every meeting email is linked to a project — create one when missing.
 */

import { parseSenderName } from './emailAddress';
import {
  emailToMergeSource,
  mergeEmailIntoProjectBody,
  pickMergedProjectValue,
} from './emailProjectMerge';
import { importEmailAttachmentsToProject } from './emailProjectAttachments';
import { assignEmailToJob } from './projectLinks';
import { formatMeetingWhenLabel } from './emailScheduling';
import {
  ensureWorkContact,
  isSafeWorkSlug,
  slugFromTitle,
  storeReadWork,
  storeWriteWork,
} from './workStore';
import { parseWorkJobInput } from './workJobInput';

function displayFirstName(input: {
  contactName?: string | null;
  from: string;
}): string {
  const fromName = parseSenderName(input.from);
  const raw = (input.contactName || fromName || '').trim();
  if (!raw) return 'Client';
  return raw.split(/\s+/)[0] || 'Client';
}

export function previewMeetingProjectTitle(input: {
  subject: string;
  contactName?: string | null;
  from: string;
  bookingStart?: string | null;
}): string {
  return meetingProjectTitle(input);
}

function meetingProjectTitle(input: {
  subject: string;
  contactName?: string | null;
  from: string;
  bookingStart?: string | null;
}): string {
  const subject = input.subject.trim();
  if (subject && !/^re:\s*meeting\b/i.test(subject)) {
    return subject.replace(/^re:\s*/i, '').trim() || subject;
  }
  const who = displayFirstName(input);
  if (input.bookingStart) {
    const when = formatMeetingWhenLabel(input.bookingStart);
    return `Meeting with ${who} — ${when}`;
  }
  return `Meeting with ${who}`;
}

function meetingBookingNote(input: {
  bookingUid?: string | null;
  bookingStart?: string | null;
}): string {
  const lines: string[] = [];
  if (input.bookingStart) {
    lines.push(`Meeting scheduled for ${formatMeetingWhenLabel(input.bookingStart)}.`);
  }
  if (input.bookingUid) {
    lines.push(`Calendar booking: ${input.bookingUid}`);
  }
  return lines.join('\n');
}

export async function ensureProjectForMeetingEmail(input: {
  emailId: string;
  from: string;
  subject: string;
  summary: string;
  bodyText: string;
  bodySnippet: string;
  receivedAt: string;
  contactUid?: string | null;
  contactName?: string | null;
  resendEmailId?: string | null;
  jobSlug?: string | null;
  bookingUid?: string | null;
  bookingStart?: string | null;
}): Promise<
  | {
      ok: true;
      slug: string;
      title: string;
      created: boolean;
      contactUid: string;
      contactName: string;
    }
  | { ok: false; error: string }
> {
  if (input.jobSlug) {
    const existing = await storeReadWork(input.jobSlug);
    if (existing) {
      return {
        ok: true,
        slug: existing.slug,
        title: existing.title,
        created: false,
        contactUid: existing.contact_uid,
        contactName: existing.contact_name,
      };
    }
  }

  const contact = await ensureWorkContact({
    contact_uid: input.contactUid,
    contact_name: input.contactName,
    from: input.from,
  });
  if (!contact.ok) {
    return { ok: false, error: contact.error };
  }

  const title = meetingProjectTitle({
    subject: input.subject,
    contactName: contact.name,
    from: input.from,
    bookingStart: input.bookingStart,
  });

  let slug = slugFromTitle(title);
  if (!slug || !isSafeWorkSlug(slug)) slug = slugFromTitle(`${contact.name}-meeting-${Date.now()}`);
  if (!slug || !isSafeWorkSlug(slug)) {
    return { ok: false, error: 'Invalid project slug' };
  }
  if (await storeReadWork(slug)) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  const email = emailToMergeSource({
    from: input.from,
    subject: input.subject,
    summary: input.summary,
    bodySnippet: input.bodySnippet,
    bodyText: input.bodyText,
    receivedAt: input.receivedAt,
  });

  const { body: mergedBody, value: extractedValue } = await mergeEmailIntoProjectBody({
    existingBody: '',
    email,
    projectTitle: title,
    isNewProject: true,
  });

  const bookingNote = meetingBookingNote({
    bookingUid: input.bookingUid,
    bookingStart: input.bookingStart,
  });
  const body = bookingNote ? `${mergedBody.trim()}\n\n---\n${bookingNote}`.trim() : mergedBody;

  const parsed = parseWorkJobInput({
    title,
    contact_uid: contact.uid,
    contact_name: contact.name,
    status: 'inquiry',
    source: 'email',
    body: '',
    record_origin: 'meeting_auto',
  });
  if ('error' in parsed) {
    return { ok: false, error: parsed.error };
  }

  const mergedValue = pickMergedProjectValue(null, extractedValue);
  const result = await storeWriteWork(slug, {
    ...parsed,
    body,
    ...(mergedValue !== undefined ? { value: mergedValue } : {}),
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  await assignEmailToJob(input.emailId, slug, result.doc.title);
  await importEmailAttachmentsToProject({
    emailId: input.emailId,
    resendEmailId: input.resendEmailId,
    jobSlug: slug,
  });

  return {
    ok: true,
    slug: result.doc.slug,
    title: result.doc.title,
    created: true,
    contactUid: contact.uid,
    contactName: contact.name,
  };
}
