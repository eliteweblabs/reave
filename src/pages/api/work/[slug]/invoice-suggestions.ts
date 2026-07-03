/**
 * GET /api/work/[slug]/invoice-suggestions — completed checklist items as Crater line descriptions.
 */

import type { APIContext } from 'astro';
import { isSafeWorkSlug, storeReadWork } from '../../../../lib/workStore';
import {
  completedItemsToInvoiceSuggestions,
  groupedInvoiceDescription,
  parseMarkdownCheckboxes,
} from '../../../../lib/workChecklist';

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

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);

  const doc = await storeReadWork(slug);
  if (!doc) return json({ ok: false, error: 'Not found' }, 404);

  const checklist = parseMarkdownCheckboxes(doc.body);
  const suggestions = completedItemsToInvoiceSuggestions(doc.body, doc.title);
  const grouped = groupedInvoiceDescription(doc.body, doc.title);

  return json({
    ok: true,
    slug: doc.slug,
    title: doc.title,
    client: doc.contact_name || doc.client,
    checklist,
    invoice_suggestions: suggestions,
    grouped_line_item: grouped,
  });
}
