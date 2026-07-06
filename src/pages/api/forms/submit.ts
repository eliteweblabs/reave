import type { APIRoute } from 'astro';
import { isEmailSendConfigured, sendEmail } from '../../../lib/outbound';

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.json();
    const { name, email, message, subject, to } = formData;

    if (!isEmailSendConfigured()) {
      console.log('[Form Submission] No RESEND_API_KEY, logging only:', formData);
      return new Response(JSON.stringify({
        success: true,
        message: 'Form submitted (no email configured)',
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const recipient = String(to || email || '').trim();
    const subjectLine = String(subject || 'New form submission').trim();
    const body = String(message || '');

    const result = await sendEmail({
      to: recipient,
      subject: subjectLine,
      text: body || subjectLine,
      html: `
        <h2>${subjectLine}</h2>
        <p><strong>From:</strong> ${name || 'Unknown'}</p>
        <p><strong>Email:</strong> ${email || 'N/A'}</p>
        <hr/>
        <pre style="white-space: pre-wrap; font-family: inherit;">${body}</pre>
      `,
    });

    if (!result.ok) {
      console.error('[Email Error]', result.error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to send email',
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('[Form Submission] Email sent to', recipient, 'ID:', result.id);

    return new Response(JSON.stringify({
      success: true,
      message: 'Email sent successfully',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Form Submission Error]', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to process submission',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
