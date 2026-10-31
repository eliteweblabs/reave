/**
 * GET  /api/work-day/session — active session for signed-in user
 * POST /api/work-day/session — { action: "start", jobSlug } | { action: "stop" }
 */
import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../lib/apiResponse';
import { requireWorkDayApi } from '../../../lib/workDayApiGate';
import {
  storeGetActiveWorkDaySession,
  storeStartWorkDaySession,
  storeStopWorkDaySession,
} from '../../../lib/workDayStore';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireWorkDayApi(context);
  if (auth instanceof Response) return auth;

  const session = await storeGetActiveWorkDaySession(auth.userId);
  return jsonResponse({ ok: true, session });
};

export const POST: APIRoute = async (context) => {
  const auth = await requireWorkDayApi(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const action = String(body.action ?? '').trim().toLowerCase();
  if (action === 'stop') {
    const result = await storeStopWorkDaySession(auth.userId);
    if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 400);
    return jsonResponse({ ok: true, session: result.session });
  }

  if (action === 'start') {
    const jobSlug = String(body.jobSlug ?? body.job_slug ?? '').trim();
    if (!jobSlug) return jsonResponse({ ok: false, error: 'jobSlug is required' }, 400);

    const result = await storeStartWorkDaySession(auth.userId, jobSlug);
    if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 400);
    return jsonResponse({ ok: true, session: result.session });
  }

  return jsonResponse({ ok: false, error: 'action must be start or stop' }, 400);
};
