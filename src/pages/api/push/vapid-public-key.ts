/**
 * GET /api/push/vapid-public-key — VAPID public key for Web Push subscribe (owner session).
 */

import type { APIContext } from 'astro';
import { isPushConfigured, vapidPublicKey } from '../../../lib/webPush';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

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
