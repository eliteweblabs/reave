import type { APIRoute } from 'astro';
import { jsonResponse, readJsonBody } from '../../../../lib/apiResponse';
import {
  clearCardLoginPendingCookie,
  finishCardPhoneLogin,
  readCardLoginPendingCookie,
} from '../../../../lib/cardPhoneClerkFapi';
import { isClerkRuntimeConfigured } from '../../../../lib/clerkClient';
import { clientIp } from '../../../../lib/clientIp';
import { checkInMemoryRateLimit } from '../../../../lib/inMemoryRateLimit';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!isClerkRuntimeConfigured()) {
    return jsonResponse({ ok: false, error: 'Sign-in is not configured on this install.' }, 503);
  }

  const parsed = await readJsonBody(context.request);
  if (!('ok' in parsed) || !parsed.ok) return parsed as Response;

  const code = typeof parsed.body.code === 'string' ? parsed.body.code : '';
  const pending = readCardLoginPendingCookie(context.request);
  if (!pending) {
    return jsonResponse({ ok: false, error: 'Code request expired. Tap Login again.' }, 400);
  }

  const ip = clientIp(context.request);
  const limited = checkInMemoryRateLimit(`card-login-verify:${ip}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 20,
  });
  if (!limited.ok) {
    return jsonResponse(
      { ok: false, error: `Too many attempts. Try again in ${limited.retryAfterSeconds}s.` },
      429,
    );
  }

  try {
    const sessionId = await finishCardPhoneLogin(context.request, pending, code);
    return jsonResponse(
      { ok: true, sessionId },
      200,
      { headers: { 'Set-Cookie': clearCardLoginPendingCookie() } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'That code did not finish sign-in.';
    return jsonResponse({ ok: false, error: message }, 400);
  }
};
