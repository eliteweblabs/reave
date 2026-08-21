/**
 * GET /api/work/visit-plan — day-by-day door-knock plan for open inquiries.
 *
 * Query params (all optional): start=YYYY-MM-DD, days, minutes, visit,
 * day_start, day_end, max_wait, mode, approach, speed, assume_hours=0|1.
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { normalizeTravelMode, planInquiryVisits } from '../../../lib/visitPlanner';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


function intParam(params: URLSearchParams, name: string): number | undefined {
  const raw = params.get(name);
  if (raw == null || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** "9:30" / "930" / "570" → minutes past midnight. */
function timeParam(params: URLSearchParams, name: string): number | undefined {
  const raw = params.get(name)?.trim();
  if (!raw) return undefined;
  const clock = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (clock) {
    const minutes = Number(clock[1]) * 60 + Number(clock[2]);
    return Number.isFinite(minutes) ? minutes : undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function boolParam(params: URLSearchParams, name: string): boolean | undefined {
  const raw = params.get(name)?.trim().toLowerCase();
  if (!raw) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return undefined;
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const params = context.url.searchParams;
  const startRaw = params.get('start')?.trim() ?? '';
  if (startRaw && !/^\d{4}-\d{2}-\d{2}$/.test(startRaw)) {
    return jsonResponse({ ok: false, error: 'start must be YYYY-MM-DD' }, 400);
  }

  try {
    const plan = await planInquiryVisits({
      startDate: startRaw || undefined,
      dayCount: intParam(params, 'days'),
      minutesPerDay: intParam(params, 'minutes'),
      visitMinutes: intParam(params, 'visit'),
      dayStartMinutes: timeParam(params, 'day_start'),
      dayEndMinutes: timeParam(params, 'day_end'),
      maxWaitMinutes: intParam(params, 'max_wait'),
      travelMode: normalizeTravelMode(params.get('mode')) ?? undefined,
      approachMode: normalizeTravelMode(params.get('approach')) ?? undefined,
      averageSpeedMph: intParam(params, 'speed'),
      assumeHoursWhenUnknown: boolParam(params, 'assume_hours'),
      skipWeekends: boolParam(params, 'skip_weekends'),
    });

    return jsonResponse({ ok: true, plan });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[visit-plan] GET error:', e);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
}
