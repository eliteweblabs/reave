/**
 * GET/PATCH /api/admin/settings — install-wide admin settings (OTP TTL, recently viewed, etc.).
 */
import type { APIContext } from 'astro';
import {
  clampOtpTtlMinutes,
  clampRecentlyViewedDays,
  coerceShareOpenChatAlerts,
  getAppSettings,
  saveAppSettings,
} from '../../../lib/appSettingsStore';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseOptionalBool(raw: unknown): boolean | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === 'boolean') return raw;
  if (raw === 1 || raw === '1' || raw === 'true' || raw === 'on') return true;
  if (raw === 0 || raw === '0' || raw === 'false' || raw === 'off') return false;
  return undefined;
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  try {
    const settings = await getAppSettings();
    return json({ ok: true, settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ ok: false, error: message }, 500);
  }
}

export async function PATCH(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const patch: {
    otpTtlMinutes?: number;
    recentlyViewedDays?: number;
    shareOpenChatAlerts?: boolean;
  } = {};
  if (body.otpTtlMinutes !== undefined) {
    const n = Number(body.otpTtlMinutes);
    if (!Number.isFinite(n)) {
      return json({ ok: false, error: 'otpTtlMinutes must be a number (0–1440).' }, 400);
    }
    patch.otpTtlMinutes = clampOtpTtlMinutes(n, 5);
  }
  if (body.recentlyViewedDays !== undefined) {
    const n = Number(body.recentlyViewedDays);
    if (!Number.isFinite(n)) {
      return json({ ok: false, error: 'recentlyViewedDays must be a number (1–365).' }, 400);
    }
    patch.recentlyViewedDays = clampRecentlyViewedDays(n, 7);
  }
  if (body.shareOpenChatAlerts !== undefined) {
    const parsed = parseOptionalBool(body.shareOpenChatAlerts);
    if (parsed === undefined) {
      return json({ ok: false, error: 'shareOpenChatAlerts must be a boolean.' }, 400);
    }
    patch.shareOpenChatAlerts = coerceShareOpenChatAlerts(parsed, false);
  }

  if (Object.keys(patch).length === 0) {
    return json({ ok: false, error: 'No settings to update.' }, 400);
  }

  try {
    const settings = await saveAppSettings(patch);
    if (!settings) return json({ ok: false, error: 'Failed to save settings.' }, 500);
    return json({ ok: true, settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ ok: false, error: message }, 500);
  }
}

/** Also accept POST for form-style autosave clients. */
export async function POST(context: APIContext): Promise<Response> {
  return PATCH(context);
}
