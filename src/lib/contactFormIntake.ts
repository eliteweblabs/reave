/**
 * Website contact / form intake: resolve-or-create client, create inquiry project,
 * dashboard engagement notice, company notify + submitter acknowledgment emails.
 */

import { getCompanyConfig } from './companyConfig';
import { recordContactFormEngagement } from './engagementNotifications';
import { buildNewProjectAckEmail } from './emailScheduling';
import { hasFeature } from './features';
import { scheduleFormUrl } from './inboundEmailReply';
import { isEmailSendConfigured, isSmsSendConfigured, sendEmail, sendSms } from './outbound';
import { smsOptInConfirmationMessage } from './smsConsent';
import { siteBaseUrl } from './requestOrigin';
import { parseWorkJobInput } from './workJobInput';
import { updateContact } from './contactApi';
import {
  ensureWorkContact,
  isSafeWorkSlug,
  slugFromTitle,
  storeReadWork,
  storeWriteWork,
} from './workStore';
import { escapeHtml } from './htmlEscape';

export type ContactFormIntakeInput = {
  name?: string | null;
  email?: string | null;
  company?: string | null;
  phone?: string | null;
  smsOptIn?: boolean | null;
  message?: string | null;
  subject?: string | null;
};

export type ContactFormIntakeResult = {
  ok: true;
  contactUid: string | null;
  contactName: string | null;
  contactCreated: boolean;
  jobSlug: string | null;
  jobTitle: string | null;
  companyEmailSent: boolean;
  submitterEmailSent: boolean;
  smsOptInConfirmationSent: boolean;
  noticeCreated: boolean;
  warnings: string[];
};

function phoneToE164(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const us = (digits.startsWith('1') && digits.length >= 11 ? digits.slice(1) : digits).slice(0, 10);
  if (us.length === 10) return `+1${us}`;
  if (digits.length >= 10) return `+${digits}`;
  return '';
}

function projectTitle(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed) return trimmed;
  return 'Website inquiry';
}

function projectBody(input: {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  smsOptIn?: boolean | null;
  message: string;
  receivedAt: string;
}): string {
  const lines = [
    '## Website contact form',
    '',
    `- **From:** ${input.name || 'Unknown'}`,
    `- **Email:** ${input.email || 'N/A'}`,
  ];
  if (input.company?.trim()) lines.push(`- **Company:** ${input.company.trim()}`);
  if (input.phone?.trim()) {
    lines.push(`- **Phone:** ${input.phone.trim()}`);
    if (input.smsOptIn != null) {
      lines.push(`- **SMS opt-in:** ${input.smsOptIn ? 'Yes' : 'No'}`);
    }
  }
  lines.push(
    `- **Received:** ${input.receivedAt}`,
    '',
    '### Message',
    '',
    input.message.trim() || '_(no message)_',
  );
  return lines.join('\n');
}

async function applyContactFormDetails(
  uid: string,
  input: { company?: string; phone?: string },
): Promise<void> {
  const patch: { company?: string; phone?: string } = {};
  const company = String(input.company || '').trim();
  const phone = String(input.phone || '').trim();
  if (company) patch.company = company;
  if (phone) patch.phone = phone;
  if (!Object.keys(patch).length) return;
  const updated = await updateContact(uid, patch);
  if (!updated.ok) {
    console.warn('[contactFormIntake] contact update failed:', updated.error);
  }
}

async function resolveCompanyRecipient(): Promise<string> {
  const company = await getCompanyConfig();
  const support = company.supportEmail?.trim();
  if (support?.includes('@')) return support;
  if (company.domain) return `hello@${company.domain}`;
  return '';
}

async function sendCompanyNotify(opts: {
  to: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  smsOptIn?: boolean | null;
  message: string;
  subject: string;
  jobSlug?: string | null;
}): Promise<boolean> {
  if (!opts.to.includes('@') || !isEmailSendConfigured()) return false;
  const jobLine = opts.jobSlug
    ? `<p><strong>Project:</strong> inquiry <code>${escapeHtml(opts.jobSlug)}</code></p>`
    : '';
  const companyLine = opts.company?.trim()
    ? `<p><strong>Company:</strong> ${escapeHtml(opts.company.trim())}</p>`
    : '';
  const phoneLine = opts.phone?.trim()
    ? `<p><strong>Phone:</strong> ${escapeHtml(opts.phone.trim())}</p>`
    : '';
  const smsLine =
    opts.smsOptIn != null
      ? `<p><strong>SMS opt-in:</strong> ${opts.smsOptIn ? 'Yes' : 'No'}</p>`
      : '';
  const result = await sendEmail({
    to: opts.to,
    subject: opts.subject,
    text: [
      opts.subject,
      '',
      `From: ${opts.name || 'Unknown'}`,
      `Email: ${opts.email || 'N/A'}`,
      opts.company?.trim() ? `Company: ${opts.company.trim()}` : '',
      opts.phone?.trim() ? `Phone: ${opts.phone.trim()}` : '',
      opts.smsOptIn != null ? `SMS opt-in: ${opts.smsOptIn ? 'Yes' : 'No'}` : '',
      opts.jobSlug ? `Project: ${opts.jobSlug}` : '',
      '',
      opts.message,
    ]
      .filter(Boolean)
      .join('\n'),
    html: `
      <h2>${escapeHtml(opts.subject)}</h2>
      <p><strong>From:</strong> ${escapeHtml(opts.name || 'Unknown')}</p>
      <p><strong>Email:</strong> ${escapeHtml(opts.email || 'N/A')}</p>
      ${companyLine}
      ${phoneLine}
      ${smsLine}
      ${jobLine}
      <hr/>
      <pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(opts.message)}</pre>
    `,
  });
  if (!result.ok) {
    console.error('[contactFormIntake] company notify failed:', result.error);
    return false;
  }
  return true;
}

async function sendSmsOptInConfirmation(opts: {
  phone: string;
  brandName: string;
}): Promise<boolean> {
  const to = phoneToE164(opts.phone);
  if (!to || !isSmsSendConfigured()) return false;

  const body = smsOptInConfirmationMessage(opts.brandName);
  const result = await sendSms({ to, body });
  if (!result.ok) {
    console.error('[contactFormIntake] SMS opt-in confirmation failed:', result.error);
    return false;
  }
  return true;
}

async function sendSubmitterAck(opts: {
  name: string;
  email: string;
  jobTitle: string;
  message: string;
}): Promise<boolean> {
  if (!opts.email.includes('@') || !isEmailSendConfigured()) return false;
  try {
    const company = await getCompanyConfig();
    const scheduleUrl = hasFeature('scheduling')
      ? scheduleFormUrl(siteBaseUrl(), { name: opts.name, email: opts.email })
      : null;
    const mail = await buildNewProjectAckEmail({
      attendeeName: opts.name || 'there',
      attendeeEmail: opts.email,
      jobTitle: opts.jobTitle,
      summary: opts.message.slice(0, 200),
      subject: opts.jobTitle,
      companyName: company.name,
      scheduleUrl,
    });
    const result = await sendEmail({
      to: opts.email,
      subject: mail.subject.replace(/^Re:\s*/i, 'Thanks — '),
      text: mail.text,
      html: mail.html,
    });
    if (!result.ok) {
      console.error('[contactFormIntake] submitter ack failed:', result.error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[contactFormIntake] submitter ack failed:', e);
    return false;
  }
}

/**
 * Process a public website form submission into CRM + dashboard notice + emails.
 * Soft-fails individual steps so a Resend outage still creates the inquiry.
 */
export async function processContactFormIntake(
  input: ContactFormIntakeInput,
): Promise<ContactFormIntakeResult> {
  const warnings: string[] = [];
  const name = String(input.name || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const company = String(input.company || '').trim();
  const phone = String(input.phone || '').trim();
  const smsOptIn = input.smsOptIn ?? null;
  const message = String(input.message || '').trim();
  const subject = String(input.subject || 'New contact form message').trim();
  const receivedAt = new Date().toISOString();

  let contactUid: string | null = null;
  let contactName: string | null = name || null;
  let contactCreated = false;
  let jobSlug: string | null = null;
  let jobTitle: string | null = null;
  let noticeCreated = false;

  if (!name && !email) {
    warnings.push('name_and_email_missing');
  } else {
    const fromHeader =
      name && email ? `"${name}" <${email}>` : email ? email : name;

    const contact = await ensureWorkContact({
      contact_name: name || null,
      from: fromHeader,
      bodyText: message,
      summary: subject,
    });

    if (!contact.ok) {
      warnings.push(`contact_failed:${contact.error}`);
    } else {
      contactUid = contact.uid;
      contactName = contact.name;
      contactCreated = contact.created;

      await applyContactFormDetails(contact.uid, { company, phone });

      const title = projectTitle(contact.name);
      let slug = slugFromTitle(title);
      if (!slug || !isSafeWorkSlug(slug)) {
        slug = slugFromTitle(`${contact.name}-${Date.now()}`);
      }
      if (!slug || !isSafeWorkSlug(slug)) {
        warnings.push('invalid_project_slug');
      } else {
        if (await storeReadWork(slug)) {
          slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
        }

        const parsed = parseWorkJobInput({
          title,
          contact_uid: contact.uid,
          contact_name: contact.name,
          status: 'inquiry',
          source: 'contact_form',
          body: projectBody({
            name: contact.name,
            email,
            company,
            phone,
            smsOptIn,
            message,
            receivedAt,
          }),
          record_origin: 'contact_form',
        });

        if ('error' in parsed) {
          warnings.push(`project_parse:${parsed.error}`);
        } else {
          const written = await storeWriteWork(slug, parsed);
          if (!written.ok) {
            warnings.push(`project_failed:${written.error}`);
          } else {
            jobSlug = written.doc.slug;
            jobTitle = written.doc.title;

            const engagement = await recordContactFormEngagement({
              contactUid: contact.uid,
              contactName: contact.name,
              jobSlug: written.doc.slug,
              jobTitle: written.doc.title,
              email,
              messagePreview: message,
            });
            noticeCreated = Boolean(engagement);
            if (!engagement) warnings.push('notice_failed');
          }
        }
      }
    }
  }

  const companyTo = await resolveCompanyRecipient();
  let companyEmailSent = false;
  if (companyTo) {
    companyEmailSent = await sendCompanyNotify({
      to: companyTo,
      name: contactName || name,
      email,
      company,
      phone,
      smsOptIn,
      message,
      subject,
      jobSlug,
    });
    if (!companyEmailSent) warnings.push('company_email_failed');
  } else {
    warnings.push('company_recipient_missing');
  }

  let submitterEmailSent = false;
  if (email.includes('@')) {
    submitterEmailSent = await sendSubmitterAck({
      name: contactName || name,
      email,
      jobTitle: jobTitle || projectTitle(contactName || name),
      message,
    });
    if (!submitterEmailSent) warnings.push('submitter_email_failed');
  }

  let smsOptInConfirmationSent = false;
  if (smsOptIn === true && phone) {
    const company = await getCompanyConfig();
    const brandName = company.name?.trim() || 'REΛVE';
    smsOptInConfirmationSent = await sendSmsOptInConfirmation({ phone, brandName });
    if (!smsOptInConfirmationSent) warnings.push('sms_opt_in_confirmation_failed');
  }

  return {
    ok: true,
    contactUid,
    contactName,
    contactCreated,
    jobSlug,
    jobTitle,
    companyEmailSent,
    submitterEmailSent,
    smsOptInConfirmationSent,
    noticeCreated,
    warnings,
  };
}
