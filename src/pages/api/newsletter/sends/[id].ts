/**
 * PATCH /api/newsletter/sends/:id — cancel or reschedule a pending send
 * (or a whole broadcast campaign).
 * Body: { action: 'cancel' | 'reschedule', dueAt?, campaignId? }
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import {
  getNewsletterSend,
  listNewsletterSends,
  cancelNewsletterSends,
  rescheduleNewsletterSends,
} from '../../../../lib/newsletterStore';
import { getNewsletterTemplate } from '../../../../lib/newsletterTemplates';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function resolveTargetIds(id: string, campaignId?: string | null): Promise<string[]> {
  if (campaignId) {
    const batch = await listNewsletterSends({ status: 'pending', campaignId, limit: 500 });
    if (batch.length) return batch.map((s) => s.id);
  }
  const one = await getNewsletterSend(id);
  if (!one) return [];
  if (one.campaignId) {
    const batch = await listNewsletterSends({
      status: 'pending',
      campaignId: one.campaignId,
      limit: 500,
    });
    if (batch.length) return batch.map((s) => s.id);
  }
  return one.status === 'pending' ? [one.id] : [];
}

export async function PATCH(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = context.params.id?.trim() ?? '';
  if (!id) return json({ ok: false, error: 'Missing id' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const action = String(body.action ?? '').trim().toLowerCase();
  const campaignId = body.campaignId ? String(body.campaignId).trim() : null;
  const ids = await resolveTargetIds(id, campaignId);
  if (!ids.length) return json({ ok: false, error: 'No pending send found' }, 404);

  if (action === 'cancel') {
    const updated = await cancelNewsletterSends(ids);
    return json({ ok: true, action: 'cancel', updated, ids });
  }

  if (action === 'reschedule') {
    const dueAt = String(body.dueAt ?? '').trim();
    const when = new Date(dueAt);
    if (!dueAt || Number.isNaN(when.getTime())) {
      return json({ ok: false, error: 'dueAt must be a valid datetime' }, 400);
    }
    if (when.getTime() < Date.now() - 60_000) {
      return json({ ok: false, error: 'dueAt must be in the future' }, 400);
    }
    const updated = await rescheduleNewsletterSends(ids, when);
    return json({ ok: true, action: 'reschedule', updated, ids, dueAt: when.toISOString() });
  }

  return json({ ok: false, error: "action must be 'cancel' or 'reschedule'" }, 400);
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const id = context.params.id?.trim() ?? '';
  if (!id) return json({ ok: false, error: 'Missing id' }, 400);
  const send = await getNewsletterSend(id);
  if (!send) return json({ ok: false, error: 'Not found' }, 404);
  const template = getNewsletterTemplate(send.templateId);
  return json({
    ok: true,
    send: {
      id: send.id,
      templateId: send.templateId,
      templateLabel: template?.label || send.templateId,
      source: send.source,
      toEmail: send.toEmail,
      firstName: send.firstName,
      subject: send.subject,
      status: send.status,
      dueAt: send.dueAt,
      sentAt: send.sentAt,
      jobSlug: send.jobSlug,
      campaignId: send.campaignId,
      error: send.error,
    },
  });
}
