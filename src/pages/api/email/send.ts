/**
 * POST /api/email/send — send outbound mail from the admin compose UI (Resend).
 */

import type { APIContext } from 'astro';
import { isEmailSendConfigured, sendEmail } from '../../../lib/outbound';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  if (!isEmailSendConfigured()) {
    return json({ ok: false, error: 'Outbound email is not configured (RESEND_API_KEY)' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const to = String(body.to ?? '').trim();
  const subject = String(body.subject ?? '').trim();
  const text = String(body.text ?? body.body ?? '').trim();

  if (!to) return json({ ok: false, error: 'Recipient (to) is required' }, 400);
  if (!subject) return json({ ok: false, error: 'Subject is required' }, 400);
  if (!text) return json({ ok: false, error: 'Message body is required' }, 400);

  const result = await sendEmail({ to, subject, text });
  if (!result.ok) return json({ ok: false, error: result.error }, 502);

  return json({ ok: true, id: result.id });
}
