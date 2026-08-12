/**
 * Owner-only demo push — sends a test notification to every subscribed device.
 *
 * GET  /api/admin/push/test — push config + subscription count
 * POST /api/admin/push/test — fire a demo notification (optional JSON body)
 */

import type { APIContext } from 'astro';
import { json } from '../../../../lib/apiJson';
import { requireDeploymentOwner } from '../../../../lib/deploymentOwner';
import { listPushSubscriptions } from '../../../../lib/pushSubscriptionStore';
import { isPushConfigured, sendPushNotification } from '../../../../lib/webPush';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  const configured = isPushConfigured();
  const subs = configured ? await listPushSubscriptions() : [];
  return json({
    ok: true,
    configured,
    subscriptions: subs.length,
    hint:
      subs.length === 0
        ? 'Open /admin on your phone, install to home screen (iOS) or enable notifications (Android), then tap Enable notifications.'
        : 'POST to this endpoint to send a test notification.',
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  if (!isPushConfigured()) {
    return json({ ok: false, error: 'Push not configured (set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)' }, 503);
  }

  const subs = await listPushSubscriptions();
  if (!subs.length) {
    return json(
      {
        ok: false,
        error: 'No push subscriptions yet. Enable notifications on your phone first.',
        subscriptions: 0,
      },
      400,
    );
  }

  let body: { title?: string; message?: string; url?: string } = {};
  try {
    const text = await context.request.text();
    if (text.trim()) body = JSON.parse(text) as typeof body;
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const title = body.title?.trim() || 'Demo notification';
  const message =
    body.message?.trim() ||
    'Push is working — you will get inbox alerts, bookings, and website monitoring here.';
  const url = body.url?.trim() || '/admin?tab=dashboard';

  await sendPushNotification({
    title,
    body: message,
    tag: 'demo-test',
    url,
    badgeCount: 3,
    bypassQuietHours: true,
  });

  return json({
    ok: true,
    sent: true,
    subscriptions: subs.length,
    title,
    message,
    url,
  });
}
