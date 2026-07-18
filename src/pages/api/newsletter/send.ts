/**
 * POST /api/newsletter/send — queue a broadcast to a segment (owner only).
 * Body: { templateId, audience: 'all' | string[], subject?, heading?, body?,
 *         ctaUrl?, ctaLabel?, sendNow? }
 */
import type { APIContext } from 'astro';
import { requireDeploymentOwner } from '../../../lib/deploymentOwner';
import { getNewsletterTemplate, type NewsletterTemplateId } from '../../../lib/newsletterTemplates';
import { queueBroadcast, processDueNewsletterSends } from '../../../lib/newsletterEngine';
import { ensureNewsletterScheduler } from '../../../lib/newsletterScheduler';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function toParagraphs(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) return raw.map((p) => String(p)).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  }
  return undefined;
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const templateId = String(body.templateId ?? '').trim();
  if (!getNewsletterTemplate(templateId)) return json({ ok: false, error: 'Unknown template' }, 400);

  let audience: 'all' | string[] = 'all';
  if (Array.isArray(body.audience)) {
    audience = body.audience.map((u) => String(u).trim()).filter(Boolean);
    if (!audience.length) return json({ ok: false, error: 'audience is empty' }, 400);
  } else if (body.audience && body.audience !== 'all') {
    return json({ ok: false, error: "audience must be 'all' or an array of uids" }, 400);
  }

  const result = await queueBroadcast({
    templateId: templateId as NewsletterTemplateId,
    audience,
    subject: body.subject ? String(body.subject) : undefined,
    heading: body.heading ? String(body.heading) : undefined,
    body: toParagraphs(body.body),
    ctaUrl: body.ctaUrl ? String(body.ctaUrl) : undefined,
    ctaLabel: body.ctaLabel ? String(body.ctaLabel) : undefined,
  });
  if (!result.ok) return json({ ok: false, error: result.error }, 400);

  ensureNewsletterScheduler();

  // Owner-triggered broadcast sends immediately, bypassing the send window.
  let dispatch = { sent: 0, failed: 0 };
  if (body.sendNow !== false) {
    const proc = await processDueNewsletterSends({ limit: 500, ignoreWindow: true });
    dispatch = { sent: proc.sent, failed: proc.failed };
  }

  return json({
    ok: true,
    queued: result.queued,
    skippedUnsubscribed: result.skippedUnsub,
    skippedNoEmail: result.skippedNoEmail,
    ...dispatch,
  });
}
