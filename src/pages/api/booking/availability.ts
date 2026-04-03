import type { APIRoute } from 'astro';
import { pool, CALCOM_USERNAME, TIMEZONE, fmtDate } from '../../../lib/calcom-db';

export const GET: APIRoute = async () => {
  try {
    console.log('[Availability] Starting availability check...');
    console.log('[Availability] DB URL:', CALCOM_DB_URL?.substring(0, 50) + '...');
    console.log('[Availability] Username:', CALCOM_USERNAME);
    
    const userRes = await pool().query(
      `SELECT u.id, u."defaultScheduleId", et.id as event_type_id, et.length, et.title
       FROM users u
       JOIN "EventType" et ON et."userId" = u.id
       WHERE u.username = $1
       LIMIT 1`,
      [CALCOM_USERNAME]
    );
    
    console.log('[Availability] User query returned:', userRes.rows.length, 'rows');

    if (userRes.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'No schedule found', days: [] }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    const user = userRes.rows[0];
    const scheduleId = user.defaultScheduleId;
    const slotLength = user.length || 30;

    const schedRes = await pool().query(
      `SELECT a."days", a."startTime", a."endTime"
       FROM "Availability" a
       WHERE a."scheduleId" = $1
       ORDER BY a."days"`,
      [scheduleId]
    );

    if (schedRes.rows.length === 0) {
      return new Response(JSON.stringify({ days: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    const twoWeeks = new Date();
    twoWeeks.setDate(twoWeeks.getDate() + 14);

    const bookingsRes = await pool().query(
      `SELECT "startTime", "endTime" FROM "Booking"
       WHERE "userId" = $1
       AND status IN ('ACCEPTED', 'PENDING')
       AND "startTime" >= $2
       AND "startTime" <= $3`,
      [user.id, now.toISOString(), twoWeeks.toISOString()]
    );

    const bookedSlots = new Set(
      bookingsRes.rows.map((b: any) => new Date(b.startTime).toISOString())
    );

    const days: { date: string; label: string; slots: string[] }[] = [];

    for (let i = 1; i <= 14; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const dayOfWeek = date.getDay();
      const dateKey = date.toISOString().split('T')[0];
      const daySlots: string[] = [];

      for (const rule of schedRes.rows) {
        const ruleDays: number[] = rule.days;
        if (!ruleDays.includes(dayOfWeek)) continue;

        const startParts = rule.startTime.toISOString
          ? new Date(rule.startTime)
          : new Date(`1970-01-01T${rule.startTime}`);
        const endParts = rule.endTime.toISOString
          ? new Date(rule.endTime)
          : new Date(`1970-01-01T${rule.endTime}`);

        const startHour = startParts.getUTCHours();
        const startMin = startParts.getUTCMinutes();
        const endHour = endParts.getUTCHours();
        const endMin = endParts.getUTCMinutes();

        let slotTime = new Date(date);
        slotTime.setHours(startHour, startMin, 0, 0);

        const endTime = new Date(date);
        endTime.setHours(endHour, endMin, 0, 0);

        while (slotTime < endTime) {
          const slotISO = slotTime.toISOString();
          if (!bookedSlots.has(slotISO) && slotTime > now) {
            const h = slotTime.getHours();
            const m = slotTime.getMinutes();
            daySlots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
          }
          slotTime = new Date(slotTime.getTime() + slotLength * 60000);
        }
      }

      if (daySlots.length > 0) {
        days.push({
          date: dateKey,
          label: fmtDate(date.toISOString()),
          slots: daySlots,
        });
      }
    }

    return new Response(JSON.stringify({ days, slotLength }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[Availability] ERROR:', err);
    console.error('[Availability] Error message:', err instanceof Error ? err.message : String(err));
    console.error('[Availability] Error stack:', err instanceof Error ? err.stack : 'No stack');
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch availability', 
      details: err instanceof Error ? err.message : String(err),
      days: [] 
    }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
