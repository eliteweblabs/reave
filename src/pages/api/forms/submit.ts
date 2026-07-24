import type { APIRoute } from 'astro';
import { processContactFormIntake } from '../../../lib/contactFormIntake';

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.json();
    const name = String(
      formData.name || formData.fullName || formData.full_name || '',
    ).trim();
    const email = String(formData.email || '').trim();
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
