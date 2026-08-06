/**
 * GET/PATCH /api/push/settings — sleep mode schedule (push, email triage, AI, alerts).
 */

import type { APIContext } from 'astro';
import {
  formatAwakeSinceLabel,
  formatQuietEndLabel,
  formatQuietHoursLabel,
  getPushQuietHoursSettings,
  isWithinQuietWindow,
  normalizeHm,
  savePushQuietHoursSettings,
} from '../../../lib/pushQuietHours';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function sleepSettingsPayload(settings: Awaited<ReturnType<typeof getPushQuietHoursSettings>>) {
  const inQuietWindow = isWithinQuietWindow(settings);
  const active = settings.sleepModeEnabled && inQuietWindow;
  return {
    ok: true as const,
    settings,
    active,
    inQuietWindow,
    quietEndLabel: formatQuietEndLabel(settings),
    awakeSinceLabel:
      !settings.sleepModeEnabled && inQuietWindow ? formatAwakeSinceLabel(settings) : null,
    label: formatQuietHoursLabel(settings),
  };
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const settings = await getPushQuietHoursSettings();
  return json(sleepSettingsPayload(settings));
}

export async function PATCH(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const rec = body as Record<string, unknown>;
  const patch: Parameters<typeof savePushQuietHoursSettings>[0] = {};

  if (rec.sleepModeEnabled !== undefined) {
    patch.sleepModeEnabled = Boolean(rec.sleepModeEnabled);
  }
  if (rec.quietStart !== undefined) {
    const start = normalizeHm(String(rec.quietStart));
    if (!start) return json({ ok: false, error: 'Invalid quietStart (use HH:MM)' }, 400);
    patch.quietStart = start;
  }
  if (rec.quietEnd !== undefined) {
    const end = normalizeHm(String(rec.quietEnd));
    if (!end) return json({ ok: false, error: 'Invalid quietEnd (use HH:MM)' }, 400);
    patch.quietEnd = end;
  }
  if (rec.timezone !== undefined) {
    const tz = String(rec.timezone).trim();
    if (!tz) return json({ ok: false, error: 'Invalid timezone' }, 400);
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
    } catch {
      return json({ ok: false, error: 'Unknown timezone' }, 400);
    }
    patch.timezone = tz;
  }
  if (rec.allowUrgentDuringSleep !== undefined) {
    patch.allowUrgentDuringSleep = Boolean(rec.allowUrgentDuringSleep);
  }

  if (!Object.keys(patch).length) {
    return json({ ok: false, error: 'Nothing to update' }, 400);
  }

  const settings = await savePushQuietHoursSettings(patch);
  if (!settings) return json({ ok: false, error: 'Save failed' }, 500);

  return json(sleepSettingsPayload(settings));
}
