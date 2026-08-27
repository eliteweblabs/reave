/**
 * POST /api/email/preview — render admin compose HTML without sending.
 */

import type { APIContext } from 'astro';
import { buildAdminComposeEmail } from '../../../lib/adminComposeEmail';
import { rewriteComposeHtmlForPreview } from '../../../lib/emailComposeImages';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const built = await buildAdminComposeEmail(body, {
    userId,
    context,
    requireRecipient: false,
    requireSubject: false,
    requireOriginal: false,
  });
  if (!built.ok) return json({ ok: false, error: built.error }, built.status);

  const html = built.mail.html
    ? rewriteComposeHtmlForPreview(built.mail.html, built.mail.attachments)
    : '';

  return json({
    ok: true,
    subject: built.mail.subject,
    html,
    text: built.mail.text,
  });
}
