/**
 * POST /api/newsletter/preview — render a template to HTML for the admin UI.
 * Body: { templateId, subject?, heading?, body?, ctaUrl?, ctaLabel?, firstName? }
 */
import type { APIContext } from 'astro';
import { getCompanyConfig } from '../../../lib/companyConfig';
import {
  getNewsletterTemplate,
  renderNewsletterEmail,
  type NewsletterTemplateContext,
  type NewsletterTemplateId,
} from '../../../lib/newsletterTemplates';

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
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const templateId = String(body.templateId ?? '').trim();
  if (!getNewsletterTemplate(templateId)) return json({ ok: false, error: 'Unknown template' }, 400);

  const company = await getCompanyConfig();
  const context_: NewsletterTemplateContext = {
    firstName: String(body.firstName ?? '').trim() || 'Alex',
    companyName: company.name,
    projectTitle: body.projectTitle ? String(body.projectTitle) : 'Your Project',
    subject: body.subject ? String(body.subject) : undefined,
    heading: body.heading ? String(body.heading) : undefined,
    body: toParagraphs(body.body),
    ctaUrl: body.ctaUrl ? String(body.ctaUrl) : undefined,
    ctaLabel: body.ctaLabel ? String(body.ctaLabel) : undefined,
    reviewUrl: body.reviewUrl ? String(body.reviewUrl) : 'https://example.com/review',
  };

  const rendered = await renderNewsletterEmail({
    templateId: templateId as NewsletterTemplateId,
    context: context_,
    unsubscribeUrl: '#preview-unsubscribe',
    subjectOverride: context_.subject,
  });
  if ('error' in rendered) return json({ ok: false, error: rendered.error }, 400);

  return json({ ok: true, subject: rendered.subject, html: rendered.html });
}
