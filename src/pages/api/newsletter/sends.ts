/**
 * GET /api/newsletter/sends — recent queue + send log for the admin UI.
 * Query: ?status=pending|sent|skipped|failed|canceled & ?limit=100
 */
import type { APIContext } from 'astro';
import { listNewsletterSends, type NewsletterSendStatus } from '../../../lib/newsletterStore';
import { ensureNewsletterScheduler } from '../../../lib/newsletterScheduler';
import { isNewsletterEnabled } from '../../../lib/newsletterEngine';

export const prerender = false;

const STATUSES: NewsletterSendStatus[] = ['pending', 'sent', 'skipped', 'failed', 'canceled'];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  ensureNewsletterScheduler();

  const url = new URL(context.request.url);
  const statusRaw = url.searchParams.get('status');
  const status = STATUSES.includes(statusRaw as NewsletterSendStatus)
    ? (statusRaw as NewsletterSendStatus)
    : undefined;
  const limitRaw = Number(url.searchParams.get('limit') ?? 100);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;

  const sends = await listNewsletterSends({ status, limit });
  return json({
    ok: true,
    enabled: isNewsletterEnabled(),
    sends: sends.map((s) => ({
      id: s.id,
      templateId: s.templateId,
      source: s.source,
      trigger: s.trigger,
      toEmail: s.toEmail,
      firstName: s.firstName,
      subject: s.subject,
      status: s.status,
      dueAt: s.dueAt,
      sentAt: s.sentAt,
      jobSlug: s.jobSlug,
      error: s.error,
      createdAt: s.createdAt,
    })),
  });
}
