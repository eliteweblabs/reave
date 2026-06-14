/**
 * Telnyx inbound SMS webhook — /api/sms
 *
 * Configure this URL in the Telnyx portal:
 *   Messaging → Messaging Profiles → your profile → Inbound
 *   Webhook URL: https://<your-host>/api/sms
 *
 * Optional signature validation: set TELNYX_WEBHOOK_PUBLIC_KEY.
 *
 * See src/lib/inboundSmsHandler.ts for triage logic.
 * See .env.example for SMS_ALLOWED_SENDERS, SMS_AI_REPLY_ENABLED, SMS_NOTIFY_CHAT_ID.
 */
import type { APIRoute } from 'astro';
import { serverEnv } from '../../lib/serverEnv';
import { verifyTelnyxWebhook } from '../../lib/telnyxClient';
import { handleInboundSms } from '../../lib/inboundSmsHandler';

export const prerender = false;

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({ status: 'ok', message: 'SMS webhook endpoint is running' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};

export const POST: APIRoute = async ({ request }) => {
  const rawBody = await request.text();

  // Validate signature if public key is configured.
  const publicKey = serverEnv('TELNYX_WEBHOOK_PUBLIC_KEY')?.trim();
  if (publicKey) {
    const sig = request.headers.get('telnyx-signature-ed25519') ?? '';
    const ts = request.headers.get('telnyx-timestamp') ?? '';
    if (!sig || !ts) {
      console.warn('[sms] missing Telnyx signature headers');
      if (import.meta.env.PROD) return new Response('Unauthorized', { status: 401 });
    } else {
      const valid = verifyTelnyxWebhook({ rawBody, signature: sig, timestamp: ts, publicKey });
      if (!valid) {
        console.error('[sms] invalid Telnyx webhook signature');
        if (import.meta.env.PROD) return new Response('Unauthorized', { status: 401 });
      }
    }
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  // Telnyx SMS webhook shape:
  // { data: { event_type: "message.received", payload: { from: {phone_number}, to: [{phone_number}], text } } }
  const data = body && typeof body === 'object' && 'data' in body
    ? (body as { data: unknown }).data : null;
  const payload = data && typeof data === 'object' && 'payload' in data
    ? (data as { payload: unknown }).payload : null;

  if (!payload || typeof payload !== 'object') {
    return new Response('Bad Request', { status: 400 });
  }

  const p = payload as Record<string, unknown>;
  const eventType = data && typeof data === 'object' && 'event_type' in data
    ? String((data as { event_type: unknown }).event_type) : '';

  // Only handle inbound messages.
  if (eventType !== 'message.received') {
    return new Response(null, { status: 200 });
  }

  const fromObj = p.from && typeof p.from === 'object' ? p.from as Record<string, unknown> : {};
  const toArr = Array.isArray(p.to) ? p.to as Array<Record<string, unknown>> : [];

  const from = String(fromObj.phone_number ?? '').trim();
  const to = toArr.length > 0 ? String(toArr[0].phone_number ?? '').trim() : '';
  const text = String(p.text ?? '').trim();
  const messageId = String(p.id ?? '').trim();

  if (!from || !text) {
    return new Response(null, { status: 200 });
  }

  console.info('[sms] inbound', { from, to, text: text.slice(0, 80), messageId });

  // Handle async so we can return 200 immediately.
  handleInboundSms({ from, to, text, messageId }).catch((err) => {
    console.error('[sms] handler error:', err);
  });

  return new Response(null, { status: 200 });
};
