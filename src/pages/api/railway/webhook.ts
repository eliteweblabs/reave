import type { APIRoute } from 'astro';
import { handleRailwayWebhook } from '../../../lib/railwayWebhookHandler';
import { serverEnv } from '../../../lib/serverEnv';
import { secretMatches } from '../../../lib/secretCompare';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const key = url.searchParams.get('key');
  const expected = serverEnv('RAILWAY_WEBHOOK_INGRESS_KEY');
  if (!expected?.trim()) {
    return jsonResponse({ ok: false, error: 'webhook ingress key not configured' }, 503);
  }
  if (!secretMatches(key, expected)) {
    return jsonResponse({ ok: false }, 401);
  }
  return jsonResponse({ ok: true, service: 'railway-deploy-webhook', time: new Date().toISOString() });
};

export const POST: APIRoute = async ({ request, url }) => {
  const key = url.searchParams.get('key');
  const rawBody = await request.text();
  const out = await handleRailwayWebhook({
    ingressKey: key,
    expectedKey: serverEnv('RAILWAY_WEBHOOK_INGRESS_KEY'),
    rawBody,
  });
  return jsonResponse({ ok: out.ok, message: out.message }, out.status);
};
