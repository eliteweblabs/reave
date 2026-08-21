/**
 * GET  /api/work/timer — current running timer (dashboard start-stop)
 * POST /api/work/timer — { action: "start", slug, note? } | { action: "stop" }
 */

import type { APIContext } from 'astro';
import { hasFeature } from '../../../lib/features';
import { isSafeWorkSlug, storeReadWork } from '../../../lib/workStore';
import {
  getTimerStatusView,
  startTimeTrackingOnProject,
  stopTimeTrackingWithMessage,
} from '../../../lib/timeTrackingSiri';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


function featureDisabled(): Response {
  return jsonResponse({ ok: false, error: 'Time tracking is not enabled on this install' }, 404);
}

export async function GET(context: APIContext): Promise<Response> {
  if (!hasFeature('time_tracking')) return featureDisabled();

  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const view = await getTimerStatusView();
  return jsonResponse({ ok: true, ...view });
}

export async function POST(context: APIContext): Promise<Response> {
  if (!hasFeature('time_tracking')) return featureDisabled();

  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const action = String(body.action ?? '').trim().toLowerCase();
  if (action === 'stop') {
    const result = await stopTimeTrackingWithMessage();
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error, text: result.text ?? result.error }, 400);
    }
    const view = await getTimerStatusView();
    return jsonResponse({
      ok: true,
      ...view,
      text: result.text,
      job_slug: result.jobSlug,
      hours: result.hours,
      logged: result.logged,
    });
  }

  if (action !== 'start') {
    return jsonResponse({ ok: false, error: 'action must be start or stop' }, 400);
  }

  const slug = String(body.slug ?? '').trim();
  if (!slug || !isSafeWorkSlug(slug)) return jsonResponse({ ok: false, error: 'Invalid slug' }, 400);

  const doc = await storeReadWork(slug);
  if (!doc) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
  const started = await startTimeTrackingOnProject(doc, note);
  if (!started.ok) return jsonResponse({ ok: false, error: started.error }, 400);

  const view = await getTimerStatusView();
  return jsonResponse({
    ok: true,
    ...view,
    text: started.text,
    switched: started.switched,
    previous: started.previous,
  });
}
