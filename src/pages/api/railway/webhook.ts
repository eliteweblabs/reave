import type { APIRoute } from 'astro';
import { handleRailwayWebhook } from '../../../lib/railwayWebhookHandler';
import { serverEnv } from '../../../lib/serverEnv';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const key = url.searchParams.get('key');
  const expected = serverEnv('RAILWAY_WEBHOOK_INGRESS_KEY');
  if (!expected?.trim()) {
    return new Response(JSON.stringify({ ok: false, error: 'webhook ingress key not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (key !== expected.trim()) {
    return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(
    JSON.stringify({ ok: true, service: 'railway-deploy-webhook', time: new Date().toISOString() }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};

export const POST: APIRoute = async ({ request, url }) => {
  const key = url.searchParams.get('key');
  const rawBody = await request.text();
  const out = await handleRailwayWebhook({
    ingressKey: key,
    expectedKey: serverEnv('RAILWAY_WEBHOOK_INGRESS_KEY'),
    rawBody,
  });
  return new Response(JSON.stringify({ ok: out.ok, message: out.message }), {
    status: out.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
