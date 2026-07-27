import type { APIRoute } from 'astro';
import { processContactFormIntake } from '../../../lib/contactFormIntake';
import { checkRateLimit, clientIp } from '../../../lib/rateLimit';

export const prerender = false;

const MAX_FIELD_LEN = 10_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function truncate(s: string, max = MAX_FIELD_LEN): string {
  return s.length > max ? s.slice(0, max) : s;
}

export const POST: APIRoute = async ({ request }) => {
  const rate = checkRateLimit(`forms:${clientIp(request)}`, {
    windowMs: 15 * 60 * 1000,
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
    const name = truncate(
      String(formData.name || formData.fullName || formData.full_name || '').trim(),
    );
    const email = truncate(String(formData.email || '').trim());
    const company = truncate(String(formData.company || '').trim());
    const phone = truncate(String(formData.phone || formData.tel || '').trim());
    const smsRaw = formData.sms_opt_in ?? formData.smsOptIn;
    const smsOptIn =
      smsRaw === 'yes' || smsRaw === true
        ? true
        : smsRaw === 'no' || smsRaw === false
          ? false
          : null;
    const message = truncate(String(formData.message || '').trim());
    const subject = truncate(String(formData.subject || 'New form submission').trim());
    const to = formData.to != null ? truncate(String(formData.to).trim()) : undefined;

    if (!name && !email && !message) {
      return new Response(
        JSON.stringify({ success: false, error: 'Empty submission' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    if (email && !EMAIL_RE.test(email)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid email address' }),
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
      contactCreated: result.contactCreated,
      companyEmailSent: result.companyEmailSent,
      submitterEmailSent: result.submitterEmailSent,
      noticeCreated: result.noticeCreated,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Form submitted successfully',
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
