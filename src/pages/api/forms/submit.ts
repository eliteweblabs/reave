import type { APIRoute } from 'astro';
import { processContactFormIntake } from '../../../lib/contactFormIntake';
import { checkInMemoryRateLimit } from '../../../lib/inMemoryRateLimit';

function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export const POST: APIRoute = async ({ request }) => {
  const rate = checkInMemoryRateLimit(`form:${clientIp(request)}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 10,
  });
  if (!rate.ok) {
    return new Response(
      JSON.stringify({ success: false, error: 'Too many submissions. Please try again later.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(rate.retryAfterSeconds),
        },
      },
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
      smsOptInConfirmationSent: result.smsOptInConfirmationSent,
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
