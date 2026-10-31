/**
 * PATCH /api/work-day/session/segment — switch project mid session
 */
import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../../lib/apiResponse';
import { requireWorkDayApi } from '../../../../lib/workDayApiGate';
import { storeSwitchWorkDaySegment } from '../../../../lib/workDayStore';

export const prerender = false;

export const PATCH: APIRoute = async (context) => {
  const auth = await requireWorkDayApi(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const jobSlug = String(body.jobSlug ?? body.job_slug ?? '').trim();
  if (!jobSlug) return jsonResponse({ ok: false, error: 'jobSlug is required' }, 400);

  const result = await storeSwitchWorkDaySegment(auth.userId, jobSlug);
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 400);
  return jsonResponse({ ok: true, session: result.session });
};
