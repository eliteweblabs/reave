/**
 * POST /api/work-day/reconcile — approve week and push hours to Work time entries
 */
import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../lib/apiResponse';
import { requireWorkDayApi } from '../../../lib/workDayApiGate';
import { appendReconcileLineToWork, type ReconcileLineInput } from '../../../lib/workDayReconcile';
import { mondayOfWeekContaining, storeSaveWorkDayReconcile, storeWorkDayWeekSummary } from '../../../lib/workDayStore';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const auth = await requireWorkDayApi(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const action = String(body.action ?? 'approve').trim().toLowerCase();
  if (action !== 'approve') {
    return jsonResponse({ ok: false, error: 'Only action approve is supported' }, 400);
  }

  const weekStart = String(body.week ?? body.weekStart ?? mondayOfWeekContaining()).trim();
  const existing = await storeWorkDayWeekSummary(weekStart);
  if (existing.approved) {
    return jsonResponse({ ok: false, error: 'Week already approved' }, 409);
  }

  const rawLines = body.lines;
  const lines: ReconcileLineInput[] = Array.isArray(rawLines)
    ? rawLines.map((row) => {
        const o = row as Record<string, unknown>;
        return {
          jobSlug: String(o.jobSlug ?? o.job_slug ?? '').trim(),
          hours: Number(o.hours),
          note: o.note != null ? String(o.note) : null,
        };
      })
    : existing.lines.map((line) => ({
        jobSlug: line.jobSlug,
        hours: line.hours,
        note: null,
      }));

  const results: { jobSlug: string; slug?: string; error?: string }[] = [];
  for (const line of lines) {
    if (!line.jobSlug) {
      results.push({ jobSlug: '', error: 'Missing job slug' });
      continue;
    }
    const posted = await appendReconcileLineToWork(line, weekStart);
    if (!posted.ok) {
      results.push({ jobSlug: line.jobSlug, error: posted.error });
    } else {
      results.push({ jobSlug: line.jobSlug, slug: posted.slug });
    }
  }

  const failed = results.filter((r) => r.error);
  if (failed.length) {
    return jsonResponse({ ok: false, error: 'Some lines failed', results }, 400);
  }

  const saved = await storeSaveWorkDayReconcile({
    weekStart,
    approvedBy: auth.userId,
    payload: { results, lines },
  });
  if (!saved) return jsonResponse({ ok: false, error: 'Could not save reconcile record' }, 500);

  return jsonResponse({ ok: true, weekStart, results });
};
