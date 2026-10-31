/**
 * POST /api/webhooks/resend
 *
 * Receives email.delivered, email.bounced, and email.complained events from Resend.
 * Verifies the svix signature using RESEND_WEBHOOK_SECRET (same secret as inbound).
 * Delivered: marks the outbound Sent log when the recipient mail server accepts the message.
 * Bounce/complaint: contact note + admin push alert.
 *
 * Configure in Resend dashboard → Webhooks → Add endpoint:
 *   URL:    https://reave.app/api/webhooks/resend
 *   Events: email.delivered, email.bounced, email.complained
 */

import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { serverEnv } from '../../../lib/serverEnv';
import { handleResendBounceEvent, type ResendBounceEvent } from '../../../lib/resendBounceHandler';
import { resendWebhookSecrets, verifyResendWebhookEvent } from '../../../lib/resendWebhookVerify';
import {
  handleResendDeliveredEvent,
  type ResendDeliveredEvent,
} from '../../../lib/resendDeliveredHandler';

export const prerender = false;

export const GET: APIRoute = async () => new Response(null, { status: 404 });

export const POST: APIRoute = async ({ request }) => {
  const apiKey = serverEnv('RESEND_API_KEY');

  if (!apiKey?.trim() || !resendWebhookSecrets().length) {
    return new Response(
      JSON.stringify({ ok: false, error: 'RESEND_API_KEY / RESEND_WEBHOOK_SECRET not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Raw body required for signature verification
  const payload = await request.text();
  const resend = new Resend(apiKey);

  let event: { type: string; data: unknown };
  try {
    event = verifyResendWebhookEvent(resend, payload, {
      id: request.headers.get('svix-id') ?? '',
      timestamp: request.headers.get('svix-timestamp') ?? '',
      signature: request.headers.get('svix-signature') ?? '',
    });
  } catch (e) {
    console.warn('[resend-webhook] signature verification failed', e);
    return new Response(JSON.stringify({ ok: false, error: 'invalid signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { type } = event;

  if (type === 'email.delivered') {
    try {
      const result = await handleResendDeliveredEvent(event as ResendDeliveredEvent);
      console.info('[resend-webhook] delivered handled', result);
      return new Response(JSON.stringify({ ok: true, ...result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      console.error('[resend-webhook] delivered handler error', e);
      return new Response(JSON.stringify({ ok: false, action: 'error' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (type !== 'email.bounced' && type !== 'email.complained') {
    // Acknowledge unknown event types so Resend does not retry them
    return new Response(
      JSON.stringify({ ok: true, action: 'ignored', type }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const result = await handleResendBounceEvent(event as ResendBounceEvent);
    console.info('[resend-webhook] bounce handled', result);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[resend-webhook] handler error', e);
    // Always 200 — prevents Resend from endlessly retrying
    return new Response(JSON.stringify({ ok: false, action: 'error' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
