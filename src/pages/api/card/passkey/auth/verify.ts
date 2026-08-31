import type { APIRoute } from 'astro';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { clerkClient } from '@clerk/astro/server';
import { jsonResponse, readJsonBody } from '../../../../../lib/apiResponse';
import { userDisplayNames } from '../../../../../lib/deploymentOwner';
import {
  clearCardPasskeyChallengeCookie,
  readCardPasskeyChallengeCookie,
} from '../../../../../lib/cardPasskeyChallenge';
import { cardPasskeyTrustCookie } from '../../../../../lib/cardPasskeyTrust';
import {
  storeFindCardPasskey,
  storeUpdateCardPasskeyCounter,
  toWebAuthnCredential,
} from '../../../../../lib/cardPasskeyStore';
import { cardWebAuthnConfig } from '../../../../../lib/cardWebAuthn';
import { isPgConfigured } from '../../../../../lib/pgPool';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!isPgConfigured()) {
    return jsonResponse({ ok: false, error: 'Passkeys are not available on this install.' }, 503);
  }

  const parsed = await readJsonBody(context.request);
  if (!('ok' in parsed) || !parsed.ok) return parsed as Response;

  const response = parsed.body.response as AuthenticationResponseJSON | undefined;
  if (!response?.id) {
    return jsonResponse({ ok: false, error: 'Missing passkey response.' }, 400);
  }

  const pending = readCardPasskeyChallengeCookie(context.request);
  if (!pending || pending.kind !== 'authentication') {
    return jsonResponse({ ok: false, error: 'Authentication expired. Refresh the page.' }, 400);
  }

  const stored = await storeFindCardPasskey(response.id);
  if (!stored) {
    return jsonResponse({ ok: false, error: 'Unknown passkey.' }, 400);
  }

  const { origin, rpID } = cardWebAuthnConfig(context.request);

  let verified;
  try {
    verified = await verifyAuthenticationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: toWebAuthnCredential(stored),
      requireUserVerification: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not verify passkey.';
    return jsonResponse({ ok: false, error: message }, 400);
  }

  if (!verified.verified) {
    return jsonResponse({ ok: false, error: 'Passkey could not be verified.' }, 400);
  }

  await storeUpdateCardPasskeyCounter(stored.credentialId, verified.authenticationInfo.newCounter);

  let displayName = 'You';
  try {
    const user = await clerkClient(context).users.getUser(stored.userId);
    displayName = userDisplayNames(user)[0] || user.firstName || displayName;
  } catch {
    /* Clerk lookup optional */
  }

  const trustCookie = cardPasskeyTrustCookie({ userId: stored.userId, displayName });

  const httpResponse = jsonResponse({
    ok: true,
    userId: stored.userId,
    displayName,
  });
  httpResponse.headers.append('Set-Cookie', clearCardPasskeyChallengeCookie());
  httpResponse.headers.append('Set-Cookie', trustCookie);
  return httpResponse;
};
