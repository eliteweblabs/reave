/**
 * POST /api/work/inquiry-hours — backfill opening hours (and missing
 * coordinates) for the contacts behind open inquiries.
 *
 * Body: { limit?: number, force?: boolean }. Each contact costs one Google
 * Place Details call, so work is batched — call again while `remaining > 0`.
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { backfillInquiryHours } from '../../../lib/contactHoursFromPlaces';
import { getGoogleMapsApiKey } from '../../../lib/googleMapsApiKey';
import { isContactApiConfigured } from '../../../lib/contactApi';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 400);
  }
  if (!getGoogleMapsApiKey()) {
    return json(
      { ok: false, error: 'GOOGLE_MAPS_API_KEY is not configured — cannot look up hours' },
      400,
    );
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await context.request.text();
    if (text.trim()) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  try {
    const result = await backfillInquiryHours({
      limit: Number(body.limit ?? 20),
      force: body.force === true,
    });
    return json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[inquiry-hours] POST error:', e);
    return json({ ok: false, error: msg }, 500);
  }
}
