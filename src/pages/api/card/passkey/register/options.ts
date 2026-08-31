import type { APIRoute } from 'astro';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { jsonResponse } from '../../../../../lib/apiResponse';
import { getAuthUser, userDisplayNames } from '../../../../../lib/deploymentOwner';
import {
  cardPasskeyChallengeCookie,
  newCardPasskeyChallenge,
} from '../../../../../lib/cardPasskeyChallenge';
import { storeListCardPasskeysForUser } from '../../../../../lib/cardPasskeyStore';
import { cardWebAuthnConfig, clerkUserIdToWebAuthnUserId } from '../../../../../lib/cardWebAuthn';
import { isClerkRuntimeConfigured } from '../../../../../lib/clerkClient';
import { isPgConfigured } from '../../../../../lib/pgPool';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!isClerkRuntimeConfigured() || !isPgConfigured()) {
    return jsonResponse({ ok: false, error: 'Passkeys are not available on this install.' }, 503);
  }

  const user = await getAuthUser(context);
  if (!user?.id) {
    return jsonResponse({ ok: false, error: 'Sign in first to register this device.' }, 401);
  }

  const { rpID, rpName } = cardWebAuthnConfig(context.request);
  const existing = await storeListCardPasskeysForUser(user.id);
  const displayName = userDisplayNames(user)[0] || user.firstName || 'Owner';
  const challengePayload = newCardPasskeyChallenge('registration', user.id);

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.id,
    userDisplayName: displayName,
    userID: clerkUserIdToWebAuthnUserId(user.id),
    challenge: challengePayload.challenge,
    attestationType: 'none',
    excludeCredentials: existing.map((row) => ({
      id: row.credentialId,
      transports: row.transports,
    })),
    authenticatorSelection: {
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'preferred',
    },
  });

  return jsonResponse(
    { ok: true, options },
    200,
    {
      headers: {
        'Set-Cookie': cardPasskeyChallengeCookie(challengePayload),
      },
    },
  );
};
