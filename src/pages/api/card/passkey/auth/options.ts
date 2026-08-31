import type { APIRoute } from 'astro';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { jsonResponse } from '../../../../../lib/apiResponse';
import {
  cardPasskeyChallengeCookie,
  newCardPasskeyChallenge,
} from '../../../../../lib/cardPasskeyChallenge';
import { cardWebAuthnConfig } from '../../../../../lib/cardWebAuthn';
import { isPgConfigured } from '../../../../../lib/pgPool';
import { storeHasCardPasskeys } from '../../../../../lib/cardPasskeyStore';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!isPgConfigured()) {
    return jsonResponse({ ok: false, error: 'Passkeys are not available on this install.' }, 503);
  }

  const hasPasskeys = await storeHasCardPasskeys();
  if (!hasPasskeys) {
    return jsonResponse({ ok: false, error: 'No passkeys registered yet.' }, 404);
  }

  const { rpID } = cardWebAuthnConfig(request);
  const challengePayload = newCardPasskeyChallenge('authentication');

  const options = await generateAuthenticationOptions({
    rpID,
    challenge: challengePayload.challenge,
    userVerification: 'preferred',
    timeout: 60000,
  });

  return jsonResponse(
    { ok: true, options },
    200,
    { headers: { 'Set-Cookie': cardPasskeyChallengeCookie(challengePayload) } },
  );
};
