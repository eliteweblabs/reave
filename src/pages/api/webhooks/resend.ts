/**
 * POST /api/webhooks/resend
 *
 * Receives email.bounced and email.complained events from Resend.
 * Verifies the svix signature using RESEND_WEBHOOK_SECRET (same secret as inbound).
 * On match: marks the contact's notes with a timestamped bounce entry and fires an
 * admin push alert so the owner sees it immediately on the dashboard / phone.
 *
 * Configure in Resend dashboard → Webhooks → Add endpoint:
 *   URL:    https://reave.app/api/webhooks/resend
 *   Events: email.bounced, email.complained
 */

import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { serverEnv } from '../../../lib/serverEnv';
import { handleResendBounceEvent, type ResendBounceEvent } from '../../../lib/resendBounceHandler';

export const prerender = false;

export const GET: APIRoute = async () => new Response(null, { status: 404 });

export const POST: APIRoute = async ({ request }) => {
  const apiKey = serverEnv('RESEND_API_KEY');
  const secret = serverEnv('RESEND_WEBHOOK_SECRET');

  if (!apiKey?.trim() || !secret?.trim()) {
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
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: request.headers.get('svix-id') ?? '',
        timestamp: request.headers.get('svix-timestamp') ?? '',
        signature: request.headers.get('svix-signature') ?? '',
      },
      webhookSecret: secret,
    }) as { type: string; data: unknown };
  } catch (e) {
    console.warn('[resend-webhook] signature verification failed', e);
    return new Response(JSON.stringify({ ok: false, error: 'invalid signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { type } = event;

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
