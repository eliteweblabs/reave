/**
 * POST /api/work-day/location — GPS sample during active work day (15s min interval)
 */
import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../lib/apiResponse';
import { requireWorkDayApi } from '../../../lib/workDayApiGate';
import {
  storeGetActiveWorkDaySession,
  storeLastWorkDayLocationTime,
  storeRecordWorkDayLocation,
} from '../../../lib/workDayStore';

export const prerender = false;

const MIN_INTERVAL_MS = 15000;

export const POST: APIRoute = async (context) => {
  const auth = await requireWorkDayApi(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return jsonResponse({ ok: false, error: 'lat and lng are required numbers' }, 400);
  }

  const session = await storeGetActiveWorkDaySession(auth.userId);
  if (!session) return jsonResponse({ ok: false, error: 'No active work day' }, 404);

  const lastAt = await storeLastWorkDayLocationTime(session.id);
  if (lastAt) {
    const elapsed = Date.now() - new Date(lastAt).getTime();
    if (elapsed < MIN_INTERVAL_MS) {
      return jsonResponse({ ok: true, throttled: true });
    }
  }

  const accuracy = body.accuracy != null ? Number(body.accuracy) : null;
  const result = await storeRecordWorkDayLocation({
    clerkUserId: auth.userId,
    lat,
    lng,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
  });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error ?? 'Failed' }, 400);

  return jsonResponse({ ok: true });
};
