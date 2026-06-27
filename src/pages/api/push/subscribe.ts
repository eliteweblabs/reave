/**
 * POST /api/push/subscribe — save browser push subscription (Clerk user).
 * DELETE — remove subscription by endpoint.
 */

import type { APIContext } from 'astro';
import { isPushConfigured } from '../../../lib/webPush';
import {
  savePushSubscription,
  removePushSubscriptionByEndpoint,
} from '../../../lib/pushSubscriptionStore';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isPushConfigured()) return json({ ok: false, error: 'Push not configured' }, 503);

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const o = body as {
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  };
  const endpoint = o.subscription?.endpoint?.trim();
  const p256dh = o.subscription?.keys?.p256dh?.trim();
  const auth = o.subscription?.keys?.auth?.trim();
  if (!endpoint || !p256dh || !auth) {
    return json({ ok: false, error: 'Missing subscription keys' }, 400);
  }

  await savePushSubscription({ userId, endpoint, p256dh, auth });
  return json({ ok: true });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }
  const endpoint = (body as { endpoint?: string }).endpoint?.trim();
  if (!endpoint) return json({ ok: false, error: 'Missing endpoint' }, 400);

  await removePushSubscriptionByEndpoint(userId, endpoint);
  return json({ ok: true });
}
