/**
 * GET /api/push/vapid-public-key — public VAPID key for Web Push subscribe.
 */

import type { APIContext } from 'astro';
import { isPushConfigured, vapidPublicKey } from '../../../lib/webPush';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const key = vapidPublicKey();
  if (!isPushConfigured() || !key) {
    return new Response(JSON.stringify({ ok: false, error: 'Push not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, publicKey: key }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
