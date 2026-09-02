import type { APIRoute } from 'astro';
import { getContact, extractPortal, appendClientPortalData } from '../../../../lib/contactApi';
import { recordVaultSubmitEngagement } from '../../../../lib/engagementNotifications';
import { hasFeature } from '../../../../lib/features';
import { checkInMemoryRateLimit } from '../../../../lib/inMemoryRateLimit';
import { clientIp } from '../../../../lib/clientIp';
import { jsonResponse, readJsonBody } from '../../../../lib/apiResponse';

export const prerender = false;

const MAX_VAULT_ENTRIES = 50;
const MAX_VAULT_FIELD_CHARS = 10_000;

export const POST: APIRoute = async ({ params, request }) => {
  const rate = checkInMemoryRateLimit(`vault:${clientIp(request)}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 10,
  });
  if (!rate.ok) {
    return jsonResponse(
      { ok: false, error: 'Too many submissions. Please try again later.' },
      429,
      { headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  if (!hasFeature('client_portal') || !hasFeature('web_handoff')) {
    return jsonResponse({ ok: false, error: 'Not found' }, 404);
  }

  const uid = (params.slug ?? '').trim();
  if (!uid) {
    return jsonResponse({ ok: false, error: 'Missing contact id' }, 400);
  }

  const parsed = await readJsonBody(request);
  if (parsed instanceof Response) return parsed;
  const entries = parsed.body.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return jsonResponse({ ok: false, error: 'No entries provided' }, 400);
  }
  if (entries.length > MAX_VAULT_ENTRIES) {
    return jsonResponse({ ok: false, error: `Too many entries (max ${MAX_VAULT_ENTRIES})` }, 400);
  }

  // Validate and normalise each entry
  const newEntries: Array<{ label: string; value?: string; username?: string; password?: string; url?: string }> = [];
  const trimField = (v: unknown) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_VAULT_FIELD_CHARS) : '';
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const entry = e as Record<string, unknown>;
    const label = typeof entry.label === 'string' ? entry.label.trim().slice(0, 200) : '';
    if (!label) continue;
    const value = trimField(entry.value);
    const username = trimField(entry.username);
    const password = trimField(entry.password);
    const url = trimField(entry.url);
    newEntries.push({
      label,
      ...(value ? { value } : {}),
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
      ...(url ? { url } : {}),
    });
  }

  if (newEntries.length === 0) {
    return jsonResponse({ ok: false, error: 'No valid entries after validation' }, 400);
  }

  // Load the current contact to verify it exists and isn't archived
  const contactRes = await getContact(uid);
  if (!contactRes.ok) {
    return jsonResponse({ ok: false, error: 'Contact not found' }, 404);
  }
  if (contactRes.data.archived) {
    return jsonResponse({ ok: false, error: 'Contact not found' }, 404);
  }

  // Append — never replace. Overlapping submits merge by id so later writes
  // cannot drop items that already landed.
  const existing = extractPortal(contactRes.data) ?? {};
  if (existing.enabled === false) {
    return jsonResponse({ ok: false, error: 'Contact not found' }, 404);
  }

  const saveRes = await appendClientPortalData(uid, newEntries);
  if (!saveRes.ok) {
    return jsonResponse({ ok: false, error: saveRes.error }, 502);
  }

  const contactName = contactRes.data.name?.trim() || 'Client';
  void recordVaultSubmitEngagement({
    contactUid: uid,
    contactName,
    labels: newEntries.map((e) => e.label),
  });

  return jsonResponse({ ok: true });
};
