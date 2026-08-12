/**
 * POST /api/work/[slug]/toggle — toggle a GFM checkbox in project notes.
 * Body: { lineIndex: number, checked: boolean }
 */

import type { APIContext } from 'astro';
import { json } from '../../../../lib/apiJson';
import { isSafeWorkSlug, storeToggleWorkCheckbox } from '../../../../lib/workStore';
import { completedItemsToInvoiceSuggestions } from '../../../../lib/workChecklist';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;


export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);

  let body: { lineIndex?: unknown; checked?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const { lineIndex, checked } = body;
  if (typeof lineIndex !== 'number' || typeof checked !== 'boolean') {
    return json({ ok: false, error: 'lineIndex (number) and checked (boolean) required' }, 400);
  }

  const result = await storeToggleWorkCheckbox(slug, lineIndex, checked);
  if (!result.ok) return json({ ok: false, error: result.error }, result.error === 'Not found' ? 404 : 400);

  const invoice_suggestions = completedItemsToInvoiceSuggestions(
    result.doc.body,
    result.doc.title,
  );

  return json({
    ok: true,
    slug: result.doc.slug,
    body: result.doc.body,
    updated: result.doc.updated,
    invoice_suggestions,
  });
}
