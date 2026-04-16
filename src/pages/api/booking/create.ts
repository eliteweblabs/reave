import type { APIRoute } from 'astro';
import { pool, CALCOM_USERNAME, CALCOM_BASE_URL, TIMEZONE } from '../../../lib/calcom-db';

// Admin email for notifications
const ADMIN_EMAIL = 'thomas@eliteweblabs.com';

// Send admin notification email
async function sendAdminNotification(name, email, phone, vehicleInfo, bookingTime, confirmationUid) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.log('[Booking] No RESEND_API_KEY, skipping admin email');
    return;
  }
  
  const formattedTime = new Date(bookingTime).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York'
  });
  
  const emailHtml = `
    <h2>🚗 New Test Drive Booked</h2>
    <p><strong>Customer:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
    <p><strong>Vehicle:</strong> ${vehicleInfo || 'Not specified'}</p>
    <p><strong>Time:</strong> ${formattedTime}</p>
    <p><strong>Confirmation:</strong> ${confirmationUid}</p>
    <hr/>
    <p><a href="https://app.cal.com/${CALCOM_USERNAME}">View in Cal.com Dashboard</a></p>
  `;
  
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: 'Reave App <onboarding@resend.dev>',
        to: ADMIN_EMAIL,
        subject: `🚗 New Test Drive: ${name} - ${vehicleInfo || 'Vehicle'}`,
        html: emailHtml
      })
    });
    
    if (response.ok) {
      console.log('[Booking] Admin notification sent');
    } else {
      const err = await response.text();
      console.log('[Booking] Admin email failed:', err);
    }
  } catch (e) {
    console.log('[Booking] Admin email error:', e.message);
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { name, email, phone, start, notes } = body;

    if (!name || !email || !start) {
      return new Response(JSON.stringify({ error: 'Missing required fields: name, email, start' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const userRes = await pool().query(
      `SELECT u.id, et.id as event_type_id, et.slug, et.length
       FROM users u
       JOIN "EventType" et ON et."userId" = u.id
       WHERE u.username = $1
       LIMIT 1`,
      [CALCOM_USERNAME]
    );

    if (userRes.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Booking calendar not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    const { event_type_id, slug, length } = userRes.rows[0];

    const startDate = new Date(start);
    if (isNaN(startDate.getTime())) {
      return new Response(JSON.stringify({ error: 'Invalid start time' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const endDate = new Date(startDate.getTime() + length * 60000);

    const bookingRes = await fetch(`${CALCOM_BASE_URL}/api/book/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        eventTypeId: event_type_id,
        eventTypeSlug: slug,
        timeZone: TIMEZONE,
        language: 'en',
        responses: {
          name,
          email,
          notes: notes || undefined,
        },
        metadata: {},
      }),
    });

    if (!bookingRes.ok) {
      const errText = await bookingRes.text();
      console.error('Booking error:', bookingRes.status, errText);
      return new Response(JSON.stringify({ error: 'Booking failed — slot may be taken' }), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await bookingRes.json();

    // Extract phone from notes if present
    let phone = null;
    if (notes) {
      const phoneMatch = notes.match(/Phone[:\s]*([\d\-()]+)/i);
      if (phoneMatch) phone = phoneMatch[1];
    }
    
    // Send admin notification
    const confirmationUid = result.booking?.uid || result.booking?.id || 'N/A';
    sendAdminNotification(name, email, phone, notes, start, confirmationUid);

    return new Response(JSON.stringify({ success: true, booking: result }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Create booking error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
