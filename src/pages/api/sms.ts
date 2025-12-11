import type { APIRoute } from 'astro';
import twilio from 'twilio';

// Twilio webhook signature validation
const validateTwilioRequest = (url: string, params: URLSearchParams, signature: string): boolean => {
  const authToken = import.meta.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.warn('TWILIO_AUTH_TOKEN not set, skipping signature validation');
    return true; // Allow in development
  }

  try {
    return twilio.validateRequest(
      authToken,
      signature,
      url,
      Object.fromEntries(params)
    );
  } catch (error) {
    console.error('Error validating Twilio signature:', error);
    return false;
  }
};

// GET endpoint for testing
export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      status: 'ok',
      message: 'SMS webhook endpoint is running',
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
};

export const POST: APIRoute = async ({ request, url }) => {
  console.log('=== SMS Webhook Received ===');
  console.log('URL:', url.toString());
  console.log('Method:', request.method);
  console.log('Headers:', Object.fromEntries(request.headers.entries()));

  try {
    // Get the raw body and parse form data
    const formData = await request.formData();
    const body: Record<string, string> = {};
    
    // Convert FormData to object
    for (const [key, value] of formData.entries()) {
      body[key] = value.toString();
    }
    
    console.log('Form data received:', body);
    
    // Get the signature from headers
    const signature = request.headers.get('X-Twilio-Signature') || '';
    console.log('Signature present:', !!signature);
    
    // Validate the request is from Twilio
    const searchParams = new URLSearchParams();
    Object.entries(body).forEach(([key, value]) => {
      searchParams.append(key, value);
    });
    
    // Use the full URL including protocol and host for validation
    const fullUrl = url.toString();
    const isValid = validateTwilioRequest(fullUrl, searchParams, signature);
    
    if (!isValid && signature) {
      console.error('Invalid Twilio signature - request may not be from Twilio');
      // In development, we might want to allow this, but log it
      if (import.meta.env.PROD) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    // Extract SMS data
    const from = body.From || '';
    const to = body.To || '';
    const messageBody = body.Body || '';
    const messageSid = body.MessageSid || '';
    const accountSid = body.AccountSid || '';

    console.log('Inbound SMS received:', {
      from,
      to,
      message: messageBody,
      messageSid,
      accountSid,
      timestamp: new Date().toISOString(),
    });

    // Check if Twilio credentials are configured
    const twilioAccountSid = import.meta.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = import.meta.env.TWILIO_AUTH_TOKEN;

    if (!twilioAccountSid || !twilioAuthToken) {
      console.warn('Twilio credentials not configured - SMS received but cannot send replies');
    } else {
      // Example: Send an auto-reply to confirm receipt
      try {
        const twilioClient = twilio(twilioAccountSid, twilioAuthToken);
        
        // Uncomment to enable auto-reply:
        // await twilioClient.messages.create({
        //   body: `Thank you for your message! We received: "${messageBody}"`,
        //   from: to, // Your Twilio number
        //   to: from, // The sender
        // });
        // console.log('Auto-reply sent successfully');
      } catch (error) {
        console.error('Error sending auto-reply:', error);
      }
    }

    // TODO: Add your SMS handling logic here
    // Examples:
    // - Forward to your AI assistant
    // - Store in database
    // - Send automated response
    // - Trigger webhook to another service

    // Return TwiML response (or empty 200 OK)
    // Twilio expects a response in TwiML format or 200 OK
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (error) {
    console.error('Error processing SMS webhook:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
    }
    // Still return 200 to Twilio to avoid retries, but log the error
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  }
};

