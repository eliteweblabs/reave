import type { APIRoute } from 'astro';
import { Resend } from 'resend';

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.json();
    const { name, email, message, subject, to } = formData;

    // Get RESEND_API_KEY from environment
    const resendKey = import.meta.env.RESEND_API_KEY;
    
    if (!resendKey) {
      console.log('[Form Submission] No RESEND_API_KEY, logging only:', formData);
      return new Response(JSON.stringify({ 
        success: true,
        message: 'Form submitted (no email configured)'
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const resend = new Resend(resendKey);
    
    // Determine recipient
    const recipient = to || email;
    const subjectLine = subject || 'New form submission';
    
    const { error } = await resend.emails.send({
      from: 'Elite Web Labs <onboarding@resend.dev>',
      to: recipient,
      subject: subjectLine,
      html: `
        <h2>${subjectLine}</h2>
        <p><strong>From:</strong> ${name || 'Unknown'}</p>
        <p><strong>Email:</strong> ${email || 'N/A'}</p>
        <hr/>
        <pre style="white-space: pre-wrap; font-family: inherit;">${message || ''}</pre>
      `
    });

    if (error) {
      console.error('[Email Error]', error);
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Failed to send email'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('[Form Submission] Email sent to', recipient);

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Email sent successfully'
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Form Submission Error]', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Failed to process submission'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};