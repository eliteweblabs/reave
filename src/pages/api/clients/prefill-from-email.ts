/**
 * POST /api/clients/prefill-from-email — derive New Contact form fields from a
 * From header + optional body/summary (Add to contacts from inbox).
 */

import type { APIContext } from 'astro';
import { contactFormPrefillFromInboundEmail } from '../../../lib/emailContactExtract';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const from = String(body.from ?? '').trim();
  if (!from) return jsonResponse({ ok: false, error: 'from is required' }, 400);

  const prefill = contactFormPrefillFromInboundEmail({
    from,
    bodyText: typeof body.bodyText === 'string' ? body.bodyText : typeof body.body_text === 'string' ? body.body_text : '',
    summary: typeof body.summary === 'string' ? body.summary : '',
  });

  if (!prefill.email.includes('@')) {
    return jsonResponse({ ok: false, error: 'No sender email in From header' }, 400);
  }

  return jsonResponse({ ok: true, prefill });
}
