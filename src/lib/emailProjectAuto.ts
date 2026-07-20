/**
 * Auto-create a project from inbound email when it looks like a new work request.
 */

import { parseSenderName } from './emailAddress';
import { looksLikePaymentNotification } from './emailMoney';
import {
  emailToMergeSource,
  mergeEmailIntoProjectBody,
  pickMergedProjectValue,
} from './emailProjectMerge';
import { importEmailAttachmentsToProject } from './emailProjectAttachments';
import { assignEmailToJob } from './projectLinks';
import {
  ensureWorkContact,
  isSafeWorkSlug,
  slugFromTitle,
  storeReadWork,
  storeWriteWork,
} from './workStore';
import { parseWorkJobInput } from './workJobInput';

export function looksLikeNewWorkRequest(input: {
  from?: string;
  subject?: string;
  summary?: string;
  bodyText?: string;
}): boolean {
  if (looksLikePaymentNotification(input)) return false;
  const blob = [input.subject, input.summary, input.bodyText].join(' ').toLowerCase();
  if (!blob.trim()) return false;
  if (/\b(meet(ing)?|schedule|calendar|appointment|get together)\b/.test(blob) &&
      /\b(\d{1,2}(:\d{2})?\s*(am|pm)|monday|tuesday|wednesday|thursday|friday)\b/i.test(blob)) {
    return false;
  }
  return /\b(website|web site|homepage|landing page|web page|site update|changes to|change request|redesign|revision|update the|new project|project request|quote|proposal|scope of work|build a site|need a site)\b/i.test(
    blob,
  );
}

function workRequestPhrase(summary: string, subject: string): string {
  const blob = `${summary} ${subject}`.toLowerCase();
  if (/\bwebsite\b/.test(blob) && /\b(change|update|revision|redesign|fix|edit)\b/.test(blob)) {
    return 'website changes';
  }
  if (/\bwebsite\b/.test(blob)) return 'website work';
  if (/\bredesign\b/.test(blob)) return 'a redesign';
  if (/\bnew project\b/.test(blob)) return 'a new project';
  if (/\bquote\b/.test(blob)) return 'a quote';
  return 'project work';
}

function displayFirstName(input: {
  contactName?: string | null;
  from: string;
}): string {
  const fromName = parseSenderName(input.from);
  const raw = (input.contactName || fromName || '').trim();
  if (!raw) return 'Client';
  return raw.split(/\s+/)[0] || 'Client';
}

export function buildAutoProjectNotificationTitle(input: {
  contactName?: string | null;
  from: string;
  summary: string;
  subject: string;
}): string {
  const who = displayFirstName(input);
  const request = workRequestPhrase(input.summary, input.subject);
  return `${who} emailed requesting ${request}. New project created.`;
}

export async function tryAutoCreateProjectFromInboundEmail(input: {
  from: string;
  subject: string;
  summary: string;
  bodyText: string;
  bodySnippet: string;
  receivedAt: string;
  contactUid?: string | null;
  contactName?: string | null;
  emailId: string;
  resendEmailId?: string | null;
}): Promise<
  | {
      ok: true;
      slug: string;
      title: string;
      routeNote: string;
      notificationTitle: string;
      contactUid: string;
      contactName: string;
    }
  | { ok: false; reason: 'not_applicable' | 'contact_failed' | 'create_failed'; error?: string }
> {
  if (!looksLikeNewWorkRequest(input)) {
    return { ok: false, reason: 'not_applicable' };
  }

  const contact = await ensureWorkContact({
    contact_uid: input.contactUid,
    contact_name: input.contactName,
    from: input.from,
  });
  if (!contact.ok) {
    return { ok: false, reason: 'contact_failed', error: contact.error };
  }

  const title = input.subject.trim() || input.summary.trim().slice(0, 80) || 'New project';
  let slug = slugFromTitle(title);
  if (!slug || !isSafeWorkSlug(slug)) slug = slugFromTitle(`${contact.name}-${Date.now()}`);
  if (!slug || !isSafeWorkSlug(slug)) {
    return { ok: false, reason: 'create_failed', error: 'Invalid project slug' };
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

  const parsed = parseWorkJobInput({
    title,
    contact_uid: contact.uid,
    contact_name: contact.name,
    status: 'inquiry',
    source: 'email',
    body: '',
    record_origin: 'email_auto',
  });
  if ('error' in parsed) {
    return { ok: false, reason: 'create_failed', error: parsed.error };
  }

  const mergedValue = pickMergedProjectValue(null, extractedValue);
  const result = await storeWriteWork(slug, {
    ...parsed,
    body: mergedBody,
    ...(mergedValue !== undefined ? { value: mergedValue } : {}),
  });
  if (!result.ok) {
    return { ok: false, reason: 'create_failed', error: result.error };
  }

  await assignEmailToJob(input.emailId, slug, result.doc.title);
  await importEmailAttachmentsToProject({
    emailId: input.emailId,
    resendEmailId: input.resendEmailId,
    jobSlug: slug,
  });

  const notificationTitle = buildAutoProjectNotificationTitle({
    contactName: contact.name,
    from: input.from,
    summary: input.summary,
    subject: input.subject,
  });

  return {
    ok: true,
    slug: result.doc.slug,
    title: result.doc.title,
    routeNote: `New project "${result.doc.title}" created automatically from inbound email`,
    notificationTitle,
    contactUid: contact.uid,
    contactName: contact.name,
  };
}
