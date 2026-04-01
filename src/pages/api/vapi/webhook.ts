import type { APIRoute } from 'astro';
import pg from 'pg';

const { Pool } = pg;

const CALCOM_DB_URL = import.meta.env.CALCOM_DATABASE_URL || '';
const CALCOM_USERNAME = import.meta.env.CALCOM_USERNAME || 'reave';
const CALCOM_BASE_URL = import.meta.env.CALCOM_API_URL || 'https://cal.reave.app';
const TIMEZONE = 'America/New_York';

const pool = new Pool({
  connectionString: CALCOM_DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

// Format time for voice: "2pm", "10:30am"
function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: TIMEZONE,
  }).replace(':00', '').toLowerCase();
}

// Format date for voice: "Thursday April 3rd"
function fmtDate(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: TIMEZONE });
  const month = d.toLocaleDateString('en-US', { month: 'long', timeZone: TIMEZONE });
  const num = parseInt(d.toLocaleDateString('en-US', { day: 'numeric', timeZone: TIMEZONE }));
  const suffix = [11, 12, 13].includes(num % 100) ? 'th'
    : num % 10 === 1 ? 'st'
    : num % 10 === 2 ? 'nd'
    : num % 10 === 3 ? 'rd' : 'th';
  return `${day} ${month} ${num}${suffix}`;
}

async function getStaffSchedule(): Promise<string> {
  try {
    // Get the user and their event types
    const userRes = await pool.query(
      `SELECT u.id, u."defaultScheduleId", et.id as event_type_id, et.length, et.title
       FROM users u
       JOIN "EventType" et ON et."userId" = u.id
       WHERE u.username = $1
       LIMIT 1`,
      [CALCOM_USERNAME]
    );

    if (userRes.rows.length === 0) {
      return 'I couldn\'t find the schedule. Let me take your info and have someone reach out.';
    }

    const user = userRes.rows[0];
    const scheduleId = user.defaultScheduleId;
    const slotLength = user.length || 30;

    // Get availability schedule
    const schedRes = await pool.query(
      `SELECT a."days", a."startTime", a."endTime"
       FROM "Availability" a
       WHERE a."scheduleId" = $1
       ORDER BY a."days"`,
      [scheduleId]
    );

    if (schedRes.rows.length === 0) {
      return 'No availability set up yet. Can I take your contact info and have someone call you?';
    }

    // Get existing bookings for next 14 days
    const now = new Date();
    const twoWeeks = new Date();
    twoWeeks.setDate(twoWeeks.getDate() + 14);

    const bookingsRes = await pool.query(
      `SELECT "startTime", "endTime" FROM "Booking"
       WHERE "userId" = $1
       AND status != 'CANCELLED'
       AND "startTime" >= $2
       AND "startTime" <= $3`,
      [user.id, now.toISOString(), twoWeeks.toISOString()]
    );

    const bookedSlots = new Set(
      bookingsRes.rows.map(b => new Date(b.startTime).toISOString())
    );

    // Build available slots for next 14 days
    const availByDay: Record<string, string[]> = {};
    
    for (let i = 1; i <= 14; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon...

      // Find matching availability rules
      for (const rule of schedRes.rows) {
        const days: number[] = rule.days;
        if (!days.includes(dayOfWeek)) continue;

        // Parse start/end times
        const startParts = rule.startTime.toISOString ? 
          new Date(rule.startTime) : new Date(`1970-01-01T${rule.startTime}`);
        const endParts = rule.endTime.toISOString ?
          new Date(rule.endTime) : new Date(`1970-01-01T${rule.endTime}`);
        
        const startHour = startParts.getUTCHours();
        const startMin = startParts.getUTCMinutes();
        const endHour = endParts.getUTCHours();
        const endMin = endParts.getUTCMinutes();

        // Generate slots
        let slotTime = new Date(date);
        slotTime.setHours(startHour, startMin, 0, 0);
        
        const endTime = new Date(date);
        endTime.setHours(endHour, endMin, 0, 0);

        // Convert to UTC for comparison with booked slots
        while (slotTime < endTime) {
          const slotISO = slotTime.toISOString();
          if (!bookedSlots.has(slotISO) && slotTime > now) {
            const dateKey = date.toISOString().split('T')[0];
            if (!availByDay[dateKey]) availByDay[dateKey] = [];
            availByDay[dateKey].push(slotISO);
          }
          slotTime = new Date(slotTime.getTime() + slotLength * 60000);
        }
      }
    }

    // Format conversationally — offer 3-4 days, 2-3 times each
    const lines: string[] = [];
    let totalOffered = 0;

    for (const [dateKey, slots] of Object.entries(availByDay)) {
      if (totalOffered >= 8) break;
      if (slots.length === 0) continue;

      const dateStr = fmtDate(slots[0]);
      const timeStrs = slots.slice(0, 3).map(s => fmtTime(s));
      totalOffered += timeStrs.length;
      lines.push(`${dateStr}: ${timeStrs.join(', ')}`);
    }

    if (lines.length === 0) {
      return 'I don\'t see any open times in the next two weeks. Would you like me to take your info and have someone reach out?';
    }

    return `Here are some available times:\n${lines.join('\n')}\n\nDo any of these work? If not, I can check for more.`;
  } catch (err) {
    console.error('getStaffSchedule error:', err);
    return 'I\'m having trouble checking the calendar. Can I get your info and have someone call you back?';
  }
}

async function bookAppointment(args: {
  start: string;
  name: string;
  email: string;
  phone?: string;
  notes?: string;
}): Promise<string> {
  try {
    // Use Cal.com's internal booking endpoint (no API key needed for self-hosted)
    const userRes = await pool.query(
      `SELECT u.id, et.id as event_type_id, et.slug, et.length
       FROM users u
       JOIN "EventType" et ON et."userId" = u.id
       WHERE u.username = $1
       LIMIT 1`,
      [CALCOM_USERNAME]
    );

    if (userRes.rows.length === 0) {
      return 'I couldn\'t find the booking calendar. Let me take your info instead.';
    }

    const { event_type_id, slug, length } = userRes.rows[0];

    // Parse the start time
    let startDate: Date;
    if (typeof args.start === 'string') {
      // Handle various formats VAPI might send
      startDate = new Date(args.start);
      if (isNaN(startDate.getTime())) {
        return 'I had trouble understanding that time. Could you say it again?';
      }
    } else {
      return 'I need a specific date and time to book. When works for you?';
    }

    const endDate = new Date(startDate.getTime() + length * 60000);

    // Book via Cal.com's booking API (self-hosted, no API key)
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
          name: args.name,
          email: args.email,
          phone: args.phone || undefined,
          notes: args.notes || undefined,
        },
        metadata: {},
      }),
    });

    if (!bookingRes.ok) {
      const errText = await bookingRes.text();
      console.error('Booking error:', bookingRes.status, errText);
      return 'That time might have just been taken. Want to try a different slot?';
    }

    const dateStr = fmtDate(startDate.toISOString());
    const timeStr = fmtTime(startDate.toISOString());

    return `You're all set! I've booked you for ${dateStr} at ${timeStr}. A confirmation will be sent to ${args.email}. Anything else I can help with?`;
  } catch (err) {
    console.error('bookAppointment error:', err);
    return 'I ran into an issue with the booking. Can I take your info and have someone confirm?';
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const messageType = body?.message?.type;

    if (messageType === 'assistant-request') {
      return new Response(JSON.stringify({}), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (messageType === 'function-call') {
      const functionCall = body.message.functionCall;
      const fnName = functionCall?.name;
      const fnArgs = functionCall?.parameters || {};

      let result = '';

      switch (fnName) {
        case 'getStaffSchedule':
        case 'getAvailability':
        case 'checkAvailability':
          result = await getStaffSchedule();
          break;

        case 'bookAppointment':
        case 'createBooking':
          result = await bookAppointment({
            start: fnArgs.start || fnArgs.dateTime || fnArgs.startTime,
            name: fnArgs.name || fnArgs.customerName || 'Guest',
            email: fnArgs.email || fnArgs.customerEmail || '',
            phone: fnArgs.phone || fnArgs.customerPhone || '',
            notes: fnArgs.notes || fnArgs.reason || '',
          });
          break;

        default:
          result = `I don't know how to handle that. Can I help with scheduling?`;
      }

      return new Response(JSON.stringify({
        results: [{ result }],
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({}), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Webhook error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
