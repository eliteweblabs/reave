/**
 * POST /api/uptime/webhook — UptimeRobot real-time alert webhook.
 *
 * Configure in UptimeRobot → Integrations → Webhook:
 *   https://reave.app/api/uptime/webhook?key=<UPTIMEROBOT_WEBHOOK_SECRET>
 *
 * Recommended JSON POST body:
 * {
 *   "monitorID": "*monitorID*",
 *   "monitorURL": "*monitorURL*",
 *   "monitorFriendlyName": "*monitorFriendlyName*",
 *   "alertType": "*alertType*",
 *   "alertTypeFriendlyName": "*alertTypeFriendlyName*",
 *   "alertDetails": "*alertDetails*",
 *   "alertDuration": "*alertDuration*",
 *   "friendlyMessage": "Monitor is *alertTypeFriendlyName*: *monitorFriendlyName*"
 * }
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../lib/features';
import {
  handleUptimeWebhook,
  parseUptimeWebhook,
  validateUptimeWebhookAuth,
  uptimeWebhookSecret,
} from '../../../lib/uptimeMonitoring';
import { ensureUptimePollScheduler } from '../../../lib/uptimePollScheduler';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export const GET: APIRoute = async () => new Response('Not found', { status: 404 });

export const POST: APIRoute = async ({ request, url }) => {
  if (!hasFeature('uptime_monitoring')) {
    return jsonResponse({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }

  if (!uptimeWebhookSecret()) {
    return jsonResponse({ ok: false, error: 'UPTIMEROBOT_WEBHOOK_SECRET not configured' }, 503);
  }

  const key = url.searchParams.get('key')?.trim() ?? null;
  const authHeader = request.headers.get('authorization');
  if (!validateUptimeWebhookAuth({ queryKey: key, authHeader })) {
    return jsonResponse({ ok: false, error: 'invalid key' }, 401);
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

  const payload = parseUptimeWebhook(body);
  if (!payload) return jsonResponse({ ok: false, error: 'invalid payload' }, 400);

  ensureUptimePollScheduler();
  const result = await handleUptimeWebhook(payload);

  return jsonResponse({ ok: true, ...result });
};
