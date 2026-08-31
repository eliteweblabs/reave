/**
 * NFC /card login is phone + chip: the page already knows the number, Clerk
 * texts a one-time code, the person holding that phone types it.
 */
import type { APIContext } from 'astro';
import { DEFAULT_SUPPORT_PHONE } from './defaultSupportPhone';
import { getDeploymentOwnerProfile } from './deploymentOwner';
import { serverEnv } from './serverEnv';

export { cardPhoneLast4, cardPhoneToE164, cardLoginUsesServerProxy } from './cardPhoneFormat';

/**
 * Phone shown on /card (Call, Text, Login OTP). Prefer Admin → Company support
 * phone; fall back to the deployment owner's Profile / Clerk phone so NFC login
 * still works when Company phone is blank.
 */
export async function resolveCardPhoneRaw(
  context: APIContext,
  supportPhone?: string | null,
): Promise<string> {
  const fromCompany = supportPhone?.trim() || '';
  if (fromCompany) return fromCompany;
  const owner = await getDeploymentOwnerProfile(context);
  const fromOwner = owner?.phone?.trim() || '';
  if (fromOwner) return fromOwner;
  const fromEnv = (serverEnv('OWNER_PHONE') ?? '').trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_SUPPORT_PHONE;
}
