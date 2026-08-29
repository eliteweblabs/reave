/**
 * PATCH  /api/admin/ai-services/:id — update a custom AI service
 * DELETE /api/admin/ai-services/:id — remove a custom AI service
 */
import type { APIContext } from 'astro';
import {
  deleteCustomAiService,
  normalizeAiServiceUpdate,
  updateCustomAiService,
} from '../../../../lib/aiServicesStore';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;

function serviceId(context: APIContext): string | null {
  const id = context.params.id?.trim();
  return id || null;
}

export async function PATCH(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = serviceId(context);
  if (!id) return jsonResponse({ ok: false, error: 'Missing id.' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const normalized = normalizeAiServiceUpdate(body);
  if (typeof normalized === 'string') {
    return jsonResponse({ ok: false, error: normalized }, 400);
  }

  try {
    const service = await updateCustomAiService(id, normalized);
    if (!service) return jsonResponse({ ok: false, error: 'Service not found.' }, 404);
    return jsonResponse({ ok: true, service });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = serviceId(context);
  if (!id) return jsonResponse({ ok: false, error: 'Missing id.' }, 400);

  try {
    const ok = await deleteCustomAiService(id);
    if (!ok) return jsonResponse({ ok: false, error: 'Service not found.' }, 404);
    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

/** Also accept POST with _method for form-style clients. */
export async function POST(context: APIContext): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = await context.request.clone().json();
  } catch {
    /* ignore */
  }
  if (body._method === 'DELETE') return DELETE(context);
  return PATCH(context);
}
