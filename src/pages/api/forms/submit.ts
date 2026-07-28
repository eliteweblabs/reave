import type { APIRoute } from 'astro';
import { processContactFormIntake } from '../../../lib/contactFormIntake';
import { clientIp } from '../../../lib/clientIp';
import { checkRateLimit } from '../../../lib/rateLimit';

const FORM_RATE_WINDOW_MS = 10 * 60 * 1000;
const FORM_RATE_MAX = 10;

export const POST: APIRoute = async ({ request }) => {
  const rate = checkRateLimit(`form:${clientIp(request)}`, {
    windowMs: FORM_RATE_WINDOW_MS,
    maxPerWindow: FORM_RATE_MAX,
  });
  if (!rate.ok) {
    return new Response(
      JSON.stringify({ success: false, error: 'Too many submissions — please wait and try again.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const formData = await request.json();
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
    const to = formData.to != null ? String(formData.to).trim() : undefined;

    if (!name && !email && !message) {
      return new Response(
        JSON.stringify({ success: false, error: 'Empty submission' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const result = await processContactFormIntake({
      name,
      email,
      company,
      phone,
      smsOptIn,
      message,
      subject,
      to,
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
      noticeCreated: result.noticeCreated,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Form submitted successfully',
        contactUid: result.contactUid,
        jobSlug: result.jobSlug,
        contactCreated: result.contactCreated,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('[Form Submission Error]', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to process submission',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};
