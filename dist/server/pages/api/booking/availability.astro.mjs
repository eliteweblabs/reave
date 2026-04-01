import { p as pool, C as CALCOM_USERNAME, f as fmtDate } from '../../../chunks/calcom-db_C1CrVkPZ.mjs';
export { renderers } from '../../../renderers.mjs';

const GET = async () => {
  try {
    const userRes = await pool.query(
      `SELECT u.id, u."defaultScheduleId", et.id as event_type_id, et.length, et.title
       FROM users u
       JOIN "EventType" et ON et."userId" = u.id
       WHERE u.username = $1
       LIMIT 1`,
      [CALCOM_USERNAME]
    );
    if (userRes.rows.length === 0) {
      return new Response(JSON.stringify({ error: "No schedule found", days: [] }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    const user = userRes.rows[0];
    const scheduleId = user.defaultScheduleId;
    const slotLength = user.length || 30;
    const schedRes = await pool.query(
      `SELECT a."days", a."startTime", a."endTime"
       FROM "Availability" a
       WHERE a."scheduleId" = $1
       ORDER BY a."days"`,
      [scheduleId]
    );
    if (schedRes.rows.length === 0) {
      return new Response(JSON.stringify({ days: [] }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    const now = /* @__PURE__ */ new Date();
    const twoWeeks = /* @__PURE__ */ new Date();
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
      bookingsRes.rows.map((b) => new Date(b.startTime).toISOString())
    );
    const days = [];
    for (let i = 1; i <= 14; i++) {
      const date = /* @__PURE__ */ new Date();
      date.setDate(date.getDate() + i);
      const dayOfWeek = date.getDay();
      const dateKey = date.toISOString().split("T")[0];
      const daySlots = [];
      for (const rule of schedRes.rows) {
        const ruleDays = rule.days;
        if (!ruleDays.includes(dayOfWeek)) continue;
        const startParts = rule.startTime.toISOString ? new Date(rule.startTime) : /* @__PURE__ */ new Date(`1970-01-01T${rule.startTime}`);
        const endParts = rule.endTime.toISOString ? new Date(rule.endTime) : /* @__PURE__ */ new Date(`1970-01-01T${rule.endTime}`);
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
            daySlots.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
          }
          slotTime = new Date(slotTime.getTime() + slotLength * 6e4);
        }
      }
      if (daySlots.length > 0) {
        days.push({
          date: dateKey,
          label: fmtDate(date.toISOString()),
          slots: daySlots
        });
      }
    }
    return new Response(JSON.stringify({ days, slotLength }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("Availability error:", err);
    return new Response(JSON.stringify({ error: "Failed to fetch availability", days: [] }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
