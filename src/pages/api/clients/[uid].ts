/**
 * GET    /api/clients/[uid] — read one contact (full metadata on demand)
 * PATCH  /api/clients/[uid] — update { name?, email?, phone?, company?, notes? }
 * DELETE /api/clients/[uid] — remove contact
 */

import type { APIContext } from 'astro';
import {
  contactSummary,
  deleteContact,
  getContact,
  isContactApiConfigured,
  updateContact,
} from '../../../lib/contactApi';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const uid = context.params.uid?.trim() ?? '';
  if (!uid) return json({ ok: false, error: 'uid is required' }, 400);

  const result = await getContact(uid);
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 404);

  const c = result.data;
  return json({
    ok: true,
    ...contactSummary(c),
    notes: c.notes ?? '',
    createdAt: c.createdAt ?? '',
    firstName: c.firstName ?? '',
    lastName: c.lastName ?? '',
  });
}

export async function PATCH(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const uid = context.params.uid?.trim() ?? '';
  if (!uid) return json({ ok: false, error: 'uid is required' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const patch: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    notes?: string;
  } = {};

  if (body.name != null) patch.name = String(body.name).trim();
  if (body.email != null) patch.email = String(body.email).trim();
  if (body.phone != null) patch.phone = String(body.phone).trim();
  if (body.company != null) patch.company = String(body.company).trim();
  if (body.notes != null) patch.notes = String(body.notes).trim();

  const result = await updateContact(uid, patch);
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);

  const c = result.data;
  return json({
    ok: true,
    ...contactSummary(c),
    notes: c.notes ?? '',
    createdAt: c.createdAt ?? '',
  });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const uid = context.params.uid?.trim() ?? '';
  if (!uid) return json({ ok: false, error: 'uid is required' }, 400);

  const result = await deleteContact(uid);
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);
  return json({ ok: true, uid, deleted: true });
}
