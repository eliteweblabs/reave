import type { APIRoute } from 'astro';
import { getContact, extractPortal, setContactPortal } from '../../../../lib/contactApi';
import { hasFeature } from '../../../../lib/features';

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  if (!hasFeature('client_portal') || !hasFeature('web_handoff')) {
    return new Response(JSON.stringify({ ok: false, error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const uid = (params.slug ?? '').trim();
  if (!uid) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing contact id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const raw = body as Record<string, unknown>;
  const entries = raw?.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'No entries provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate and normalise each entry
  const newEntries: Array<{ label: string; value?: string; username?: string; password?: string; url?: string }> = [];
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const entry = e as Record<string, unknown>;
    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    if (!label) continue;
    newEntries.push({
      label,
      ...(typeof entry.value === 'string' && entry.value.trim() ? { value: entry.value.trim() } : {}),
      ...(typeof entry.username === 'string' && entry.username.trim() ? { username: entry.username.trim() } : {}),
      ...(typeof entry.password === 'string' && entry.password.trim() ? { password: entry.password.trim() } : {}),
      ...(typeof entry.url === 'string' && entry.url.trim() ? { url: entry.url.trim() } : {}),
    });
  }

  if (newEntries.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'No valid entries after validation' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Load the current contact to verify it exists and isn't archived
  const contactRes = await getContact(uid);
  if (!contactRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: 'Contact not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (contactRes.data.archived) {
    return new Response(JSON.stringify({ ok: false, error: 'Contact not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Merge new entries into existing portal data (append, don't replace)
  const existing = extractPortal(contactRes.data) ?? {};
  if (existing.enabled === false) {
    return new Response(JSON.stringify({ ok: false, error: 'Contact not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const merged = {
    ...existing,
    data: [...(existing.data ?? []), ...newEntries],
  };

  const saveRes = await setContactPortal(uid, merged);
  if (!saveRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: saveRes.error }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
