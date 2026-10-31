/**
 * Map approved Work Day lines to Work time entries on the tracked project.
 */

import { storeReadWork } from './workStore';
import { storeAppendTimeEntry } from './timeEntries';
import { isSafeWorkSlug } from './workStore';

export type ReconcileLineInput = {
  jobSlug: string;
  hours: number;
  note?: string | null;
};

function normalizeHours(h: number): number | null {
  if (!Number.isFinite(h) || h <= 0 || h > 9999) return null;
  return Math.round(h * 100) / 100;
}

export async function appendReconcileLineToWork(
  line: ReconcileLineInput,
  weekStart: string,
): Promise<{ ok: true; slug: string; hours: number } | { ok: false; error: string }> {
  const slug = line.jobSlug?.trim();
  if (!slug || !isSafeWorkSlug(slug)) return { ok: false, error: 'Invalid job slug' };

  const hours = normalizeHours(line.hours);
  if (hours == null) return { ok: false, error: 'Invalid hours' };

  const job = await storeReadWork(slug);
  if (!job) return { ok: false, error: 'Work project not found' };

  const site = job.site_address?.trim();
  const noteBase = line.note?.trim() || `On-site — week of ${weekStart}`;
  const note = site ? `${noteBase} — ${site}` : noteBase;

  const appended = await storeAppendTimeEntry(slug, { hours, note });
  if (!appended.ok) return { ok: false, error: appended.error };

  return { ok: true, slug, hours };
}
