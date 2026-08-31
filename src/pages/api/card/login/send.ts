import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../../lib/apiResponse';
import { resolveCardPhoneRaw, cardPhoneToE164 } from '../../../../lib/cardPhoneAuth';
import {
  cardLoginPendingCookie,
  clearCardLoginPendingCookie,
  finishCardPhoneLogin,
  readCardLoginPendingCookie,
  startCardPhoneLogin,
} from '../../../../lib/cardPhoneClerkFapi';
import { getCompanyConfig } from '../../../../lib/companyConfig';
import { isClerkRuntimeConfigured } from '../../../../lib/clerkClient';
import { clientIp } from '../../../../lib/clientIp';
import { checkInMemoryRateLimit } from '../../../../lib/inMemoryRateLimit';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!isClerkRuntimeConfigured()) {
    return jsonResponse({ ok: false, error: 'Sign-in is not configured on this install.' }, 503);
  }

  const ip = clientIp(context.request);
  const limited = checkInMemoryRateLimit(`card-login-send:${ip}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 12,
  });
  if (!limited.ok) {
    return jsonResponse(
      { ok: false, error: `Too many code requests. Try again in ${limited.retryAfterSeconds}s.` },
      429,
    );
  }

  const company = await getCompanyConfig(context.request);
  const phoneE164 = cardPhoneToE164(await resolveCardPhoneRaw(context, company.supportPhone));
  if (!phoneE164) {
    return jsonResponse({ ok: false, error: 'This card does not have a login phone yet.' }, 400);
  }

  const allowSignUp = import.meta.env.PUBLIC_CLERK_ALLOW_SIGN_UP !== '0';

  try {
    const pending = await startCardPhoneLogin(context.request, phoneE164, allowSignUp);
    return jsonResponse(
      { ok: true, mode: pending.mode, last4: phoneE164.slice(-4) },
      200,
      { headers: { 'Set-Cookie': cardLoginPendingCookie(pending) } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not send a code.';
    return jsonResponse({ ok: false, error: message }, 400);
  }
};
