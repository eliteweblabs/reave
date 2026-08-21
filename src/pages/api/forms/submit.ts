import type { APIRoute } from 'astro';
import { processContactFormIntake } from '../../../lib/contactFormIntake';
import { checkInMemoryRateLimit } from '../../../lib/inMemoryRateLimit';
import { clientIp } from '../../../lib/clientIp';
import { jsonResponse, readJsonBody } from '../../../lib/apiResponse';
import { isValidEmail } from '../../../lib/installIdentityFormat';

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

  const parsed = await readJsonBody(request);
  if (parsed instanceof Response) return parsed;
  const formData = parsed.body;

  // Honeypot — bots fill hidden fields; real forms use name/email/message.
  const honeypot = String(formData.website_url ?? formData.company_website ?? '').trim();
  if (honeypot) {
    return jsonResponse({ success: true, message: 'Form submitted successfully' });
  }

  try {
    const name = String(
      formData.name || formData.fullName || formData.full_name || '',
    ).trim();
    const email = String(formData.email || '').trim();
    const company = String(formData.company || '').trim();
    const phone = String(formData.phone || formData.tel || '').trim();
    const smsRaw = formData.sms_opt_in ?? formData.smsOptIn;
    const smsOptIn =
      smsRaw === 'yes' || smsRaw === true
        ? true
        : smsRaw === 'no' || smsRaw === false
          ? false
          : null;
    const message = String(formData.message || '').trim();
    const subject = String(formData.subject || 'New form submission').trim();

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
    });

    if (result.warnings.length) {
      console.warn('[Form Submission] warnings:', result.warnings.join(', '));
    }
    console.log('[Form Submission]', {
      contactUid: result.contactUid,
      contactCreated: result.contactCreated,
      jobSlug: result.jobSlug,
      companyEmailSent: result.companyEmailSent,
      submitterEmailSent: result.submitterEmailSent,
      smsOptInConfirmationSent: result.smsOptInConfirmationSent,
      noticeCreated: result.noticeCreated,
    });

    return jsonResponse({
      success: true,
      message: 'Form submitted successfully',
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
