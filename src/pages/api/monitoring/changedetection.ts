import type { APIRoute } from 'astro';
import { serverEnv } from '../../../lib/serverEnv';
import { hasFeature } from '../../../lib/features';
import {
  handleSiteChangeAlert,
  parseChangeDetectionWebhook,
} from '../../../lib/siteMonitoring';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * ChangeDetection.io → Reave push bridge.
 *
 * Configure watches with Apprise notification URL (set automatically when a
 * client Site URL watch is created):
 *   jsons://<your-domain>/api/monitoring/changedetection?key=<SECRET>&watch=<uuid>
 *
 * Set CHANGEDETECTION_WEBHOOK_SECRET on both Reave and use the same value in ?key=.
 */
export const POST: APIRoute = async ({ request, url }) => {
  if (!hasFeature('site_monitoring')) {
    return json({ ok: false, error: 'site_monitoring not enabled' }, 404);
  }

  const expected = serverEnv('CHANGEDETECTION_WEBHOOK_SECRET')?.trim();
  const key = url.searchParams.get('key')?.trim();
  if (!expected) {
    return json({ ok: false, error: 'CHANGEDETECTION_WEBHOOK_SECRET not configured' }, 503);
  }
  if (!key || key !== expected) {
    return json({ ok: false, error: 'invalid key' }, 401);
  }

  let body: unknown = null;
  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else {
      const text = await request.text();
      body = text ? JSON.parse(text) : null;
    }
  } catch {
    body = null;
  }

  const queryWatch = url.searchParams.get('watch');
  const payload = parseChangeDetectionWebhook(body, queryWatch);
  const result = await handleSiteChangeAlert(payload);

  return json({ ok: true, ...result });
};

export const GET: APIRoute = async () => json({ ok: true, endpoint: 'changedetection webhook' });
