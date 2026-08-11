/**
 * GET /api/work/[slug]/time — list time entries on a job
 * PUT /api/work/[slug]/time — replace all entries { entries: [{ hours, note, id? }] }
 */

import type { APIContext } from 'astro';
import { hasFeature } from '../../../../lib/features';
import { isSafeWorkSlug, storeReadWork } from '../../../../lib/workStore';
import { storeListTimeEntries, storeSaveTimeEntries, sumTimeEntryHours } from '../../../../lib/timeEntries';
import { json } from '../../../../lib/apiJson';
import {
  groupedTimeInvoiceDescription,
  timeEntriesToInvoiceSuggestions,
} from '../../../../lib/workTimeBilling';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;

function featureDisabled(): Response {
  return json({ ok: false, error: 'Time tracking is not enabled on this install' }, 404);
}

export async function GET(context: APIContext): Promise<Response> {
  if (!hasFeature('time_tracking')) return featureDisabled();

  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);

  const doc = await storeReadWork(slug);
  if (!doc) return json({ ok: false, error: 'Not found' }, 404);

  const entries = await storeListTimeEntries(slug);
  const totalHours = sumTimeEntryHours(entries);
  const invoiceSuggestions = timeEntriesToInvoiceSuggestions(entries, doc.title);
  const groupedLineItem = groupedTimeInvoiceDescription(entries, doc.title);

  return json({
    ok: true,
    slug: doc.slug,
    title: doc.title,
    entries,
    total_hours: totalHours,
    invoice_suggestions: invoiceSuggestions,
    grouped_line_item: groupedLineItem,
  });
}

export async function PUT(context: APIContext): Promise<Response> {
  if (!hasFeature('time_tracking')) return featureDisabled();

  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);

  const doc = await storeReadWork(slug);
  if (!doc) return json({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const result = await storeSaveTimeEntries(slug, body.entries);
  if (!result.ok) return json({ ok: false, error: result.error }, 400);

  return json({
    ok: true,
    entries: result.entries,
    total_hours: result.totalHours,
    invoice_suggestions: timeEntriesToInvoiceSuggestions(result.entries, doc.title),
    grouped_line_item: groupedTimeInvoiceDescription(result.entries, doc.title),
  });
}
