import type { APIRoute } from 'astro';

const CALCOM_API_URL = import.meta.env.CALCOM_API_URL || 'https://cal.reave.app';
const CALCOM_API_KEY = import.meta.env.CALCOM_API_KEY || '';
const CALCOM_EVENT_TYPE_ID = import.meta.env.CALCOM_EVENT_TYPE_ID || '';
const CALCOM_USERNAME = import.meta.env.CALCOM_USERNAME || 'reave';
const TIMEZONE = 'America/New_York';

// Format a date nicely for voice: "Thursday April 3rd at 2pm"
function formatSlotForVoice(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: TIMEZONE });
  const month = d.toLocaleDateString('en-US', { month: 'long', timeZone: TIMEZONE });
  const date = d.toLocaleDateString('en-US', { day: 'numeric', timeZone: TIMEZONE });
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: TIMEZONE,
  }).replace(':00', '').toLowerCase();

  // Add ordinal suffix
  const num = parseInt(date);
  const suffix = [11, 12, 13].includes(num % 100) ? 'th'
    : num % 10 === 1 ? 'st'
    : num % 10 === 2 ? 'nd'
    : num % 10 === 3 ? 'rd' : 'th';

  return `${day} ${month} ${num}${suffix} at ${time}`;
}

// Group slots by day for conversational output
function formatSlotsConversational(slots: Record<string, { time: string }[]>): string {
  const lines: string[] = [];
  let totalOffered = 0;

  for (const [date, times] of Object.entries(slots)) {
    if (!times || times.length === 0) continue;
    if (totalOffered >= 6) break; // Don't overwhelm with options

    const d = new Date(date + 'T12:00:00');
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    const monthName = d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
    const dayNum = d.getDate();

    const timeStrings = times.slice(0, 3).map(t => {
      const td = new Date(t.time);
      return td.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: TIMEZONE,
      }).replace(':00', '').toLowerCase();
    });

    totalOffered += timeStrings.length;
    lines.push(`${dayName} ${monthName} ${dayNum}: ${timeStrings.join(', ')}`);
  }

  if (lines.length === 0) {
    return 'I don\'t see any available times in the next week. Would you like me to check further out?';
  }

  return `Here are some available times:\n${lines.join('\n')}\n\nDo any of these work for you? If not, I can look for more options.`;
}

async function getAvailability(): Promise<string> {
  try {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 14); // Look 2 weeks ahead

    const start = startDate.toISOString().split('T')[0];
    const end = endDate.toISOString().split('T')[0];

    const url = `${CALCOM_API_URL}/api/v1/slots?apiKey=${CALCOM_API_KEY}&eventTypeId=${CALCOM_EVENT_TYPE_ID}&startTime=${start}&endTime=${end}&timeZone=${encodeURIComponent(TIMEZONE)}`;

    const res = await fetch(url);
    if (!res.ok) {
      console.error('Cal.com slots error:', res.status, await res.text());
      return 'I\'m having trouble checking the calendar right now. Can I get your contact info and have someone reach out to schedule?';
    }

    const data = await res.json();
    const slots = data?.slots || {};
    return formatSlotsConversational(slots);
  } catch (err) {
    console.error('getAvailability error:', err);
    return 'I\'m having trouble accessing the calendar. Can I take your information and have someone call you back to schedule?';
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
    const res = await fetch(`${CALCOM_API_URL}/api/v1/bookings?apiKey=${CALCOM_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventTypeId: parseInt(CALCOM_EVENT_TYPE_ID),
        start: args.start,
        responses: {
          name: args.name,
          email: args.email,
          phone: args.phone || '',
          notes: args.notes || '',
        },
        timeZone: TIMEZONE,
        language: 'en',
        metadata: {},
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Cal.com booking error:', res.status, errText);
      return 'I wasn\'t able to book that time. It may have just been taken. Would you like to try a different time?';
    }

    const data = await res.json();
    const booking = data?.booking || data;
    const startFormatted = formatSlotForVoice(args.start);

    return `You're all set! I've booked your appointment for ${startFormatted}. You'll receive a confirmation email at ${args.email}. Is there anything else I can help with?`;
  } catch (err) {
    console.error('bookAppointment error:', err);
    return 'I ran into an issue booking that appointment. Can I take your information and have someone confirm the booking with you?';
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const messageType = body?.message?.type;

    // Handle assistant-request (return empty to use default)
    if (messageType === 'assistant-request') {
      return new Response(JSON.stringify({}), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Handle function calls
    if (messageType === 'function-call') {
      const functionCall = body.message.functionCall;
      const fnName = functionCall?.name;
      const fnArgs = functionCall?.parameters || {};

      let result = '';

      switch (fnName) {
        case 'getStaffSchedule':
        case 'getAvailability':
        case 'checkAvailability':
          result = await getAvailability();
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
          result = `I don't know how to handle that request. Can I help you with something else?`;
      }

      return new Response(JSON.stringify({
        results: [{ result }],
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Handle other message types (status-update, end-of-call, etc.)
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
