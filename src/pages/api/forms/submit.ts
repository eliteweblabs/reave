import type { APIRoute } from 'astro';
import { processContactFormIntake } from '../../../lib/contactFormIntake';
import {
  grandOpeningCheckoutUrl,
  sealGrandOpeningCheckoutToken,
} from '../../../lib/grandOpeningCheckout';
import { checkInMemoryRateLimit } from '../../../lib/inMemoryRateLimit';
import { clientIp } from '../../../lib/clientIp';
import { jsonResponse, readJsonBody } from '../../../lib/apiResponse';
import { isValidEmail } from '../../../lib/installIdentityFormat';

/** Max field lengths — keeps public form abuse bounded. */
const MAX_NAME_CHARS = 200;
const MAX_EMAIL_CHARS = 254;
const MAX_COMPANY_CHARS = 200;
const MAX_PHONE_CHARS = 40;
const MAX_SUBJECT_CHARS = 200;
const MAX_MESSAGE_CHARS = 10_000;
const MAX_WEBSITE_CHARS = 400;
const MAX_REGISTRAR_CHARS = 120;
const MAX_REGISTRAR_FIELD_CHARS = 200;

function trimField(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

export const POST: APIRoute = async ({ request }) => {
  const rate = checkInMemoryRateLimit(`form:${clientIp(request)}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 10,
  });
  if (!rate.ok) {
    return jsonResponse(
      { success: false, error: 'Too many submissions. Please try again later.' },
      429,
      { headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  try {
    const parsed = await readJsonBody(request);
    if (parsed instanceof Response) return parsed;
    const formData = parsed.body;

    // Honeypot — bots fill hidden "website_url"; real forms use "url" or omit.
    const honeypot = String(formData.website_url ?? formData.company_website ?? '').trim();
    if (honeypot) {
      return jsonResponse({ success: true, message: 'Form submitted successfully' });
    }

    const name = trimField(
      formData.name || formData.fullName || formData.full_name,
      MAX_NAME_CHARS,
    );
    const email = trimField(formData.email, MAX_EMAIL_CHARS);
    const company = trimField(formData.company, MAX_COMPANY_CHARS);
    const phone = trimField(formData.phone || formData.tel, MAX_PHONE_CHARS);
    const smsRaw = formData.sms_opt_in ?? formData.smsOptIn;
    const smsOptIn =
      smsRaw === 'yes' || smsRaw === true
        ? true
        : smsRaw === 'no' || smsRaw === false
          ? false
          : null;
    const message = trimField(formData.message, MAX_MESSAGE_CHARS);
    const subject = trimField(formData.subject || 'New form submission', MAX_SUBJECT_CHARS);
    const website = trimField(formData.website || formData.domain || formData.url, MAX_WEBSITE_CHARS);
    const domain = trimField(formData.domain, MAX_WEBSITE_CHARS);
    const registrar = trimField(formData.registrar, MAX_REGISTRAR_CHARS);
    const registrarAccess = trimField(formData.registrar_access, 40);
    const registrarUsername = trimField(formData.registrar_username, MAX_REGISTRAR_FIELD_CHARS);
    const registrarPassword = trimField(formData.registrar_password, MAX_REGISTRAR_FIELD_CHARS);

    if (!name && !email && !message) {
      return jsonResponse({ success: false, error: 'Empty submission' }, 400);
    }

    if (email && !isValidEmail(email)) {
      return jsonResponse({ success: false, error: 'Invalid email address' }, 400);
    }

    const result = await processContactFormIntake({
      name,
      email,
      company,
      phone,
      smsOptIn,
      message,
      subject,
      website,
      domain,
      registrar,
      registrarAccess,
      registrarUsername,
      registrarPassword,
    });

    if (result.warnings.length) {
      console.warn('[Form Submission] warnings:', result.warnings.join(', '));
    }

    let checkoutUrl: string | null = null;
    const grandOpeningFlow = /grand opening/i.test(subject);
    if (grandOpeningFlow && result.contactUid && result.jobSlug && email) {
      checkoutUrl = grandOpeningCheckoutUrl(
        sealGrandOpeningCheckoutToken({
          contactUid: result.contactUid,
          jobSlug: result.jobSlug,
          email,
        }),
      );
    }

    console.log('[Form Submission]', {
      contactUid: result.contactUid,
      contactCreated: result.contactCreated,
      jobSlug: result.jobSlug,
      checkoutUrl: checkoutUrl ? '(set)' : null,
      companyEmailSent: result.companyEmailSent,
      submitterEmailSent: result.submitterEmailSent,
      smsOptInConfirmationSent: result.smsOptInConfirmationSent,
      noticeCreated: result.noticeCreated,
    });

    return jsonResponse({
      success: true,
      message: 'Form submitted successfully',
      checkoutUrl,
      contactUid: result.contactUid,
      jobSlug: result.jobSlug,
    });
  } catch (error) {
    console.error('[Form Submission Error]', error);
    return jsonResponse(
      {
        success: false,
        error: 'Failed to process submission',
      },
      500,
    );
  }
};
