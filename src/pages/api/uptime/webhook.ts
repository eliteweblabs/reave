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

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async () =>
  json({ ok: true, endpoint: 'uptimerobot webhook', configured: Boolean(uptimeWebhookSecret()) });

export const POST: APIRoute = async ({ request, url }) => {
  if (!hasFeature('uptime_monitoring')) {
    return json({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }

  if (!uptimeWebhookSecret()) {
    return json({ ok: false, error: 'UPTIMEROBOT_WEBHOOK_SECRET not configured' }, 503);
  }

  const key = url.searchParams.get('key')?.trim() ?? null;
  const authHeader = request.headers.get('authorization');
  if (!validateUptimeWebhookAuth({ queryKey: key, authHeader })) {
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

  const payload = parseUptimeWebhook(body);
  if (!payload) return json({ ok: false, error: 'invalid payload' }, 400);

  ensureUptimePollScheduler();
  const result = await handleUptimeWebhook(payload);

  return json({ ok: true, ...result });
};
