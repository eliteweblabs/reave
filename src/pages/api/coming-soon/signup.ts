import type { APIRoute } from 'astro';
import { clerkCreateUser, isClerkConfigured } from '../../../lib/clerkClient';
import { sendEmail, isEmailSendConfigured } from '../../../lib/outbound';
import { jsonResponse } from '../../../lib/apiResponse';
import { clientIp } from '../../../lib/clientIp';
import { checkRateLimit, resetRateLimit } from '../../../lib/inMemoryRateLimit';

const EMAIL_WINDOW_MS = 60_000;
const IP_WINDOW_MS = 10 * 60_000;
const IP_MAX_PER_WINDOW = 8;

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function rateLimited(retryAfterMs: number): Response {
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return jsonResponse(
    { ok: false, error: 'Wait a minute before trying again.' },
    429,
    { headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

export const POST: APIRoute = async ({ request }) => {
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

  const ip = clientIp(request);
  const ipKey = `coming-soon-ip:${ip}`;
  const emailKey = `coming-soon-email:${email}`;

  const emailRate = checkRateLimit(emailKey, 1, EMAIL_WINDOW_MS);
  if (!emailRate.allowed) {
    // Same address was just saved — idempotent success instead of a false "wait" error.
    return jsonResponse({ ok: true });
  }

  const ipRate = checkRateLimit(ipKey, IP_MAX_PER_WINDOW, IP_WINDOW_MS);
  if (!ipRate.allowed) {
    resetRateLimit(emailKey);
    return rateLimited(ipRate.retryAfterMs);
  }

  if (!isClerkConfigured()) {
    resetRateLimit(ipKey);
    resetRateLimit(emailKey);
    return jsonResponse({ ok: false, error: 'Sign-up is not configured yet.' }, 503);
  }

  const created = await clerkCreateUser({
    email_address: [email],
    skip_password_requirement: true,
    public_metadata: { source: 'coming-soon', site: 'upsidedownbottle' },
  });

  if (!created.ok) {
    const msg = created.error || '';
    if (!/already exists|taken|duplicate/i.test(msg)) {
      resetRateLimit(ipKey);
      resetRateLimit(emailKey);
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
