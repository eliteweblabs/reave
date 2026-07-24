/**
 * POST /api/deck/view — record a sales deck page view (engagement notification).
 * Deduped per sessionKey so refresh/spam does not flood the dashboard.
 */

import type { APIRoute } from 'astro';
import { createHash } from 'crypto';
import { getContact } from '../../../lib/contactApi';
import { recordDeckViewEngagement } from '../../../lib/engagementNotifications';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function dayBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

export const POST: APIRoute = async ({ request, locals }) => {
  // Owner previewing the deck while signed in should not create engagement noise.
  const userId = locals.auth?.()?.userId ?? null;
  if (userId) return json({ ok: true, skipped: 'signed_in' });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

  const contactUid =
    typeof raw.contactUid === 'string'
      ? raw.contactUid.trim()
      : typeof raw.ref === 'string'
        ? raw.ref.trim()
        : '';
  const industry = typeof raw.industry === 'string' ? raw.industry.trim().slice(0, 64) : '';
  const clientSession =
    typeof raw.sessionKey === 'string' ? raw.sessionKey.trim().slice(0, 120) : '';

  const ua = request.headers.get('user-agent') || '';
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '';
  const fingerprint = createHash('sha256')
    .update(`${clientSession || 'anon'}|${ua.slice(0, 160)}|${ip}|${dayBucket()}|${industry}`)
    .digest('hex')
    .slice(0, 32);

  let contactName: string | null = null;
  if (contactUid) {
    const contactRes = await getContact(contactUid);
    if (contactRes.ok) contactName = contactRes.data.name?.trim() || null;
  }

  const sessionKey = contactUid
    ? `${contactUid}:${dayBucket()}:${industry || 'default'}`
    : fingerprint;

  const event = await recordDeckViewEngagement({
    contactUid: contactUid || null,
    contactName,
    industry: industry || null,
    sessionKey,
  });

  return json({ ok: true, recorded: !!event });
};
