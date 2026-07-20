/**
 * GET    /api/email/inbox/[id] — full stored email (body + headers)
 * PATCH  /api/email/inbox/[id] — update category/action (e.g. mark junk)
 * DELETE /api/email/inbox/[id] — remove from inbox log
 */

import type { APIContext } from 'astro';
import {
  storeDeleteEmailInbox,
  storeGetEmailInbox,
  storeUpdateEmailInbox,
  type EmailInboxPatch,
} from '../../../../lib/emailInboxStore';
import type { EmailCategory } from '../../../../lib/emailProcessor';
import { extractMonetaryAmountFromEmail } from '../../../../lib/emailMoney';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const CATEGORIES = new Set<EmailCategory>([
  'junk',
  'client',
  'alert',
  'internal',
  'review',
  'receipt',
  'project',
]);

function parsePatch(body: unknown): EmailInboxPatch | null {
  if (!body || typeof body !== 'object') return null;
  const rec = body as Record<string, unknown>;
  const patch: EmailInboxPatch = {};
  if (rec.category != null) {
    const cat = String(rec.category).toLowerCase() as EmailCategory;
    if (!CATEGORIES.has(cat)) return null;
    patch.category = cat;
  }
  if (rec.action != null) patch.action = String(rec.action);
  if (rec.status != null) patch.status = String(rec.status);
  if (rec.bookingUid !== undefined) {
    patch.bookingUid = rec.bookingUid == null ? null : String(rec.bookingUid);
  }
  if (rec.bookingStart !== undefined) {
    patch.bookingStart = rec.bookingStart == null ? null : String(rec.bookingStart);
  }
  if (rec.seen === true || rec.markSeen === true) patch.markSeen = true;
  if (rec.markAutomationAck === true || rec.automationAck === true) patch.markAutomationAck = true;
  return Object.keys(patch).length ? patch : null;
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing id' }, 400);

  const event = await storeGetEmailInbox(id);
  if (!event) return json({ ok: false, error: 'Not found' }, 404);
  const monetaryAmount = extractMonetaryAmountFromEmail(event);
  return json({
    ok: true,
    event: { ...event, monetaryAmount, hasMonetaryValue: monetaryAmount != null },
  });
}

export async function PATCH(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing id' }, 400);

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const patch = parsePatch(body);
  if (!patch) return json({ ok: false, error: 'Nothing to update' }, 400);

  const event = await storeUpdateEmailInbox(id, patch);
  if (!event) return json({ ok: false, error: 'Not found' }, 404);
  const monetaryAmount = extractMonetaryAmountFromEmail(event);
  return json({
    ok: true,
    event: { ...event, monetaryAmount, hasMonetaryValue: monetaryAmount != null },
  });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing id' }, 400);

  const deleted = await storeDeleteEmailInbox(id);
  if (!deleted) return json({ ok: false, error: 'Not found' }, 404);
  return json({ ok: true });
}
