import type { APIRoute } from 'astro';
import { contactSummary, getContact, isContactApiConfigured, updateContact } from '../../../lib/contactApi';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ params, locals }) => {
  const { userId } = locals.auth?.() ?? {};
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const uid = (params.uid ?? '').trim();
  if (!uid) return json({ ok: false, error: 'Not found' }, 404);

  const res = await getContact(uid);
  if (!res.ok) return json({ ok: false, error: res.error }, res.status ?? 404);

  return json({
    ok: true,
    ...contactSummary(res.data),
    notes: res.data.notes ?? '',
    archived: !!res.data.archived,
    createdAt: res.data.createdAt ?? null,
  });
};

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const { userId } = locals.auth?.() ?? {};
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const uid = (params.uid ?? '').trim();
  if (!uid) return json({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const res = await updateContact(uid, {
    name: typeof body.name === 'string' ? body.name : undefined,
    email: typeof body.email === 'string' ? body.email : body.email == null ? '' : undefined,
    phone: typeof body.phone === 'string' ? body.phone : body.phone == null ? '' : undefined,
    company: typeof body.company === 'string' ? body.company : body.company == null ? '' : undefined,
    notes: typeof body.notes === 'string' ? body.notes : body.notes == null ? '' : undefined,
  });
  if (!res.ok) return json({ ok: false, error: res.error }, res.status ?? 502);

  return json({
    ok: true,
    ...contactSummary(res.data),
    notes: res.data.notes ?? '',
    archived: !!res.data.archived,
    createdAt: res.data.createdAt ?? null,
  });
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const { userId } = locals.auth?.() ?? {};
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const base = import.meta.env.CONTACT_API_BASE_URL;
  const key = import.meta.env.CONTACT_API_KEY;
  if (!base) return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);

  const uid = (params.uid ?? '').trim();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers['X-API-Key'] = key;

  const body = await request.json();
  const res = await fetch(`${base}/api/contacts/${encodeURIComponent(uid)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return json(data, res.status);
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const { userId } = locals.auth?.() ?? {};
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const base = import.meta.env.CONTACT_API_BASE_URL;
  const key = import.meta.env.CONTACT_API_KEY;
  if (!base) return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);

  const uid = (params.uid ?? '').trim();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers['X-API-Key'] = key;

  const res = await fetch(`${base}/api/contacts/${encodeURIComponent(uid)}`, {
    method: 'DELETE',
    headers,
  });

  if (res.status === 204 || res.status === 200) {
    const body = res.status === 204 ? { ok: true } : await res.json();
    return json(body, 200);
  }

  const data = await res.json().catch(() => ({ error: 'Unknown error' }));
  return json(data, res.status);
};
