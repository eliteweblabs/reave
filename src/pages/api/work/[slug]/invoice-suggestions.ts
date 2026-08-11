/**
 * GET /api/work/[slug]/invoice-suggestions — completed checklist items as Crater line descriptions.
 */

import type { APIContext } from 'astro';
import { hasFeature } from '../../../../lib/features';
import { isSafeWorkSlug, storeReadWork } from '../../../../lib/workStore';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { json } from '../../../../lib/apiJson';
import {
  completedItemsToInvoiceSuggestions,
  groupedInvoiceDescription,
  parseMarkdownCheckboxes,
} from '../../../../lib/workChecklist';
import { storeListTimeEntries } from '../../../../lib/timeEntries';
import {
  groupedTimeInvoiceDescription,
  timeEntriesToInvoiceSuggestions,
} from '../../../../lib/workTimeBilling';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);

  const doc = await storeReadWork(slug);
  if (!doc) return json({ ok: false, error: 'Not found' }, 404);

  const checklist = parseMarkdownCheckboxes(doc.body);
  const suggestions = completedItemsToInvoiceSuggestions(doc.body, doc.title);
  const grouped = groupedInvoiceDescription(doc.body, doc.title);

  const timeEnabled = hasFeature('time_tracking');
  const timeEntries = timeEnabled ? await storeListTimeEntries(slug) : [];
  const timeInvoiceSuggestions = timeEnabled
    ? timeEntriesToInvoiceSuggestions(timeEntries, doc.title)
    : [];
  const groupedTimeLineItem = timeEnabled
    ? groupedTimeInvoiceDescription(timeEntries, doc.title)
    : null;

  return json({
    ok: true,
    slug: doc.slug,
    title: doc.title,
    client: doc.contact_name || doc.client,
    checklist,
    invoice_suggestions: suggestions,
    grouped_line_item: grouped,
    time_entries: timeEntries,
    time_invoice_suggestions: timeInvoiceSuggestions,
    grouped_time_line_item: groupedTimeLineItem,
  });
}
