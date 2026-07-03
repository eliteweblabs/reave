/**
 * POST /api/work/[slug]/toggle — toggle a GFM checkbox in project notes.
 * Body: { lineIndex: number, checked: boolean }
 */

import type { APIContext } from 'astro';
import { isSafeWorkSlug, storeToggleWorkCheckbox } from '../../../../lib/workStore';
import { completedItemsToInvoiceSuggestions } from '../../../../lib/workChecklist';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

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
