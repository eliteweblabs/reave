import type { APIRoute } from 'astro';
import { clerkCreateUser, isClerkConfigured } from '../../../lib/clerkClient';
import { sendEmail, isEmailSendConfigured } from '../../../lib/outbound';
import { jsonResponse } from '../../../lib/apiResponse';

const rate = new Map<string, number>();
const RATE_MS = 60_000;

function clientKey(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export const POST: APIRoute = async ({ request }) => {
  const key = clientKey(request);
  const now = Date.now();
  const last = rate.get(key) ?? 0;
  if (now - last < RATE_MS) {
    return jsonResponse({ ok: false, error: 'Wait a minute before trying again.' }, 429);
  }
  rate.set(key, now);

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid request.' }, 400);
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return jsonResponse({ ok: false, error: 'Enter a valid email.' }, 400);
  }

  if (!isClerkConfigured()) {
    return jsonResponse({ ok: false, error: 'Sign-up is not configured yet.' }, 503);
  }

  const created = await clerkCreateUser({
    email_address: [email],
    skip_password_checks: true,
    public_metadata: { source: 'coming-soon', site: 'upsidedownbottle' },
  });

  if (!created.ok) {
    const msg = created.error || '';
    if (!/already exists|taken|duplicate/i.test(msg)) {
      return jsonResponse({ ok: false, error: msg || 'Could not save email.' }, 400);
    }
  }

  if (isEmailSendConfigured()) {
    await sendEmail({
      to: email,
      subject: 'Got it.',
      text: "Got it. That's all for now.",
      html: '<p>Got it. That\'s all for now.</p>',
    });
  }

  return jsonResponse({ ok: true });
};
