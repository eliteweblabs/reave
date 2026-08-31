/**
 * WebAuthn RP configuration for /card passkey device recognition.
 */
import { cachedCompanyBrandName } from './companyConfig';
import { requestOrigin } from './requestOrigin';

export type CardWebAuthnConfig = {
  rpID: string;
  origin: string;
  rpName: string;
};

export function cardWebAuthnConfig(request: Request): CardWebAuthnConfig {
  const origin = requestOrigin(request);
  const url = new URL(origin);
  return {
    rpID: url.hostname,
    origin,
    rpName: cachedCompanyBrandName()?.trim() || 'Contact card',
  };
}

export function clerkUserIdToWebAuthnUserId(userId: string): Uint8Array {
  return new TextEncoder().encode(userId);
}
