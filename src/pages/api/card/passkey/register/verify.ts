import type { APIRoute } from 'astro';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { jsonResponse, readJsonBody } from '../../../../../lib/apiResponse';
import { getAuthUser } from '../../../../../lib/deploymentOwner';
import {
  clearCardPasskeyChallengeCookie,
  readCardPasskeyChallengeCookie,
} from '../../../../../lib/cardPasskeyChallenge';
import { storeSaveCardPasskey } from '../../../../../lib/cardPasskeyStore';
import { cardWebAuthnConfig } from '../../../../../lib/cardWebAuthn';
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

  const parsed = await readJsonBody(context.request);
  if (!('ok' in parsed) || !parsed.ok) return parsed as Response;

  const response = parsed.body.response as RegistrationResponseJSON | undefined;
  if (!response?.id) {
    return jsonResponse({ ok: false, error: 'Missing passkey response.' }, 400);
  }

  const pending = readCardPasskeyChallengeCookie(context.request);
  if (!pending || pending.kind !== 'registration' || pending.userId !== user.id) {
    return jsonResponse({ ok: false, error: 'Registration expired. Try again.' }, 400);
  }

  const { origin, rpID } = cardWebAuthnConfig(context.request);

  let verified;
  try {
    verified = await verifyRegistrationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not verify passkey registration.';
    return jsonResponse({ ok: false, error: message }, 400);
  }

  if (!verified.verified || !verified.registrationInfo) {
    return jsonResponse({ ok: false, error: 'Passkey registration could not be verified.' }, 400);
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verified.registrationInfo;
  const saved = await storeSaveCardPasskey({
    credentialId: credential.id,
    userId: user.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
  });

  if (!saved) {
    return jsonResponse({ ok: false, error: 'Could not save passkey.' }, 500);
  }

  return jsonResponse(
    { ok: true, credentialId: saved.credentialId },
    200,
    { headers: { 'Set-Cookie': clearCardPasskeyChallengeCookie() } },
  );
};
