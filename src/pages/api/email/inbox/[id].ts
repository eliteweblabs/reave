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
import { dismissEmailRelatedNotifications } from '../../../../lib/emailNotificationSync';
import type { EmailCategory } from '../../../../lib/emailProcessor';
import { isPendingReviewNotification } from '../../../../lib/emailAutomation';
import { plainTextForDisplay, resolveEmailHtmlForDisplay } from '../../../../lib/emailBody';
import { extractMonetaryAmountFromEmail } from '../../../../lib/emailMoney';
import { unlinkProjectItem } from '../../../../lib/projectLinks';

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
  if (rec.rejectProjectMatch === true) {
    return { rejectProjectMatch: true };
  }
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
  if (rec.acceptAutomationDecision === true) patch.acceptAutomationDecision = true;
  return Object.keys(patch).length ? patch : null;
}

function isEmailArchivedOrRemoved(patch: EmailInboxPatch): boolean {
  const action = String(patch.action || '').toLowerCase();
  const status = String(patch.status || '').toLowerCase();
  return patch.category === 'junk' || action === 'filed' || action === 'junk' || status === 'filed';
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
    event: {
      ...event,
      bodyHtml: resolveEmailHtmlForDisplay(event.bodyHtml, event.bodyText),
      bodyText: plainTextForDisplay(event.bodyText),
      bodySnippet: plainTextForDisplay(event.bodySnippet),
      summary: event.summary ? plainTextForDisplay(event.summary) : event.summary,
      monetaryAmount,
      hasMonetaryValue: monetaryAmount != null,
    },
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

  const existing = await storeGetEmailInbox(id);
  if (!existing) return json({ ok: false, error: 'Not found' }, 404);

  if (patch.rejectProjectMatch) {
    const slug = existing.jobSlug?.trim();
    if (slug) {
      await unlinkProjectItem(slug, 'email', id).catch(() => undefined);
    }
    const event = await storeUpdateEmailInbox(id, {
      jobSlug: null,
      jobTitle: null,
      automationKind: null,
      action: 'review',
      status: 'UNMATCHED',
      routeNote: 'Project match dismissed',
      acceptAutomationDecision: true,
      markAutomationAck: true,
    });
    if (!event) return json({ ok: false, error: 'Not found' }, 404);
    const monetaryAmount = extractMonetaryAmountFromEmail(event);
    return json({
      ok: true,
      event: { ...event, monetaryAmount, hasMonetaryValue: monetaryAmount != null },
    });
  }

  const { rejectProjectMatch: _reject, ...storePatch } = patch;
  if (
    storePatch.markAutomationAck &&
    !storePatch.acceptAutomationDecision &&
    isPendingReviewNotification(existing) &&
    !existing.automationTriageAt
  ) {
    return json(
      {
        ok: false,
        error: 'Triage feedback required before dismissing agent review',
        requiresTriage: true,
        emailId: id,
      },
      409,
    );
  }
  if (isEmailArchivedOrRemoved(storePatch)) {
    storePatch.markAutomationAck = true;
  }
  const event = await storeUpdateEmailInbox(id, storePatch);
  if (!event) return json({ ok: false, error: 'Not found' }, 404);
  if (isEmailArchivedOrRemoved(storePatch)) {
    await dismissEmailRelatedNotifications(id, { markAutomationAck: false }).catch(() => undefined);
  }
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

  await dismissEmailRelatedNotifications(id, { markAutomationAck: false }).catch(() => undefined);
  const deleted = await storeDeleteEmailInbox(id);
  if (!deleted) return json({ ok: false, error: 'Not found' }, 404);
  return json({ ok: true });
}
