import { p as pool, C as CALCOM_USERNAME, a as CALCOM_BASE_URL, T as TIMEZONE } from '../../../chunks/calcom-db_C1CrVkPZ.mjs';
export { renderers } from '../../../renderers.mjs';

const POST = async ({ request }) => {
  try {
    const body = await request.json();
    const { name, email, start, notes } = body;
    if (!name || !email || !start) {
      return new Response(JSON.stringify({ error: "Missing required fields: name, email, start" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const userRes = await pool.query(
      `SELECT u.id, et.id as event_type_id, et.slug, et.length
       FROM users u
       JOIN "EventType" et ON et."userId" = u.id
       WHERE u.username = $1
       LIMIT 1`,
      [CALCOM_USERNAME]
    );
    if (userRes.rows.length === 0) {
      return new Response(JSON.stringify({ error: "Booking calendar not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    const { event_type_id, slug, length } = userRes.rows[0];
    const startDate = new Date(start);
    if (isNaN(startDate.getTime())) {
      return new Response(JSON.stringify({ error: "Invalid start time" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const endDate = new Date(startDate.getTime() + length * 6e4);
    const bookingRes = await fetch(`${CALCOM_BASE_URL}/api/book/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        eventTypeId: event_type_id,
        eventTypeSlug: slug,
        timeZone: TIMEZONE,
        language: "en",
        responses: {
          name,
          email,
          notes: notes || void 0
        },
        metadata: {}
      })
    });
    if (!bookingRes.ok) {
      const errText = await bookingRes.text();
      console.error("Booking error:", bookingRes.status, errText);
      return new Response(JSON.stringify({ error: "Booking failed — slot may be taken" }), {
        status: 422,
        headers: { "Content-Type": "application/json" }
      });
    }
    const result = await bookingRes.json();
    return new Response(JSON.stringify({ success: true, booking: result }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("Create booking error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
