/**
 * GET /api/email/inbox — list recent inbound email triage results
 */

import type { APIContext } from 'astro';
import { emailInboxStorageBackend, storeListEmailInbox } from '../../../lib/emailInboxStore';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const limitRaw = context.url.searchParams.get('limit');
  const limit = Math.min(Math.max(Number(limitRaw) || 100, 1), 500);

  const events = await storeListEmailInbox(limit);
  return json({
    ok: true,
    events,
    storage: emailInboxStorageBackend(),
    pipeline: {
      inbound: 'POST /api/email/inbound (Resend webhook)',
      rules: 'GET /api/email/rules',
    },
  });
}
