import twilio from 'twilio';
export { renderers } from '../../renderers.mjs';

const validateTwilioRequest = (url, params, signature) => {
  {
    console.warn("TWILIO_AUTH_TOKEN not set, skipping signature validation");
    return true;
  }
};
const GET = async () => {
  return new Response(
    JSON.stringify({
      status: "ok",
      message: "SMS webhook endpoint is running",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
};
const POST = async ({ request, url }) => {
  console.log("=== SMS Webhook Received ===");
  console.log("URL:", url.toString());
  console.log("Method:", request.method);
  console.log("Headers:", Object.fromEntries(request.headers.entries()));
  try {
    const formData = await request.formData();
    const body = {};
    for (const [key, value] of formData.entries()) {
      body[key] = value.toString();
    }
    console.log("Form data received:", body);
    const signature = request.headers.get("X-Twilio-Signature") || "";
    console.log("Signature present:", !!signature);
    const searchParams = new URLSearchParams();
    Object.entries(body).forEach(([key, value]) => {
      searchParams.append(key, value);
    });
    const fullUrl = url.toString();
    const isValid = validateTwilioRequest(fullUrl, searchParams, signature);
    if (!isValid && signature) {
      console.error("Invalid Twilio signature - request may not be from Twilio");
      if (true) {
        return new Response("Unauthorized", { status: 401 });
      }
    }
    const from = body.From || "";
    const to = body.To || "";
    const messageBody = body.Body || "";
    const messageSid = body.MessageSid || "";
    const accountSid = body.AccountSid || "";
    console.log("Inbound SMS received:", {
      from,
      to,
      message: messageBody,
      messageSid,
      accountSid,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    const twilioAccountSid = undefined                                  ;
    const twilioAuthToken = undefined                                 ;
    if (!twilioAccountSid || !twilioAuthToken) {
      console.warn("Twilio credentials not configured - SMS received but cannot send replies");
    }
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: {
        "Content-Type": "text/xml"
      }
    });
  } catch (error) {
    console.error("Error processing SMS webhook:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message, error.stack);
    }
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: {
        "Content-Type": "text/xml"
      }
    });
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
