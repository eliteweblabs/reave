import type { APIRoute } from 'astro';
import { pool, CALCOM_USERNAME } from '../../../lib/calcom-db';

export const GET: APIRoute = async () => {
  try {
    // Get user info
    const userRes = await pool().query(
      `SELECT u.id, u.username, u."defaultScheduleId", u."timeZone"
       FROM users u
       WHERE u.username = $1`,
      [CALCOM_USERNAME]
    );

    // Get schedule
    const scheduleRes = await pool().query(
      `SELECT a.id, a."scheduleId", a."days", a."startTime", a."endTime"
       FROM "Availability" a
       WHERE a."scheduleId" = $1
       ORDER BY a."days", a."startTime"`,
      [userRes.rows[0]?.defaultScheduleId]
    );

    // Get event types
    const eventTypeRes = await pool().query(
      `SELECT et.id, et.title, et.length, et."userId"
       FROM "EventType" et
       WHERE et."userId" = $1
       LIMIT 5`,
      [userRes.rows[0]?.id]
    );

    return new Response(JSON.stringify({
      user: userRes.rows[0],
      schedule: scheduleRes.rows,
      eventTypes: eventTypeRes.rows,
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
