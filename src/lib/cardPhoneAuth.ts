/**
 * NFC /card login is phone + chip: the page already knows the number, Clerk
 * texts a one-time code, the person holding that phone types it.
 */
import type { APIContext } from 'astro';
import { DEFAULT_SUPPORT_PHONE } from './defaultSupportPhone';
import { getDeploymentOwnerProfile, type DeploymentOwnerProfile } from './deploymentOwner';
import { serverEnv } from './serverEnv';

export { cardPhoneLast4, cardPhoneToE164 } from './cardPhoneFormat';

export type ResolvedCardPhone = {
  raw: string;
  /** When false, hide Text/SMS on /card (landline or main office line). */
  mobile: boolean;
};

/**
 * Phone shown on /card (Call, Text, Login OTP). Prefer the card subject's Profile
 * phone, then Admin → Company support phone, then the owner's Profile / env fallbacks.
 */
export async function resolveCardPhone(
  context: APIContext,
  supportPhone?: string | null,
  cardSubject?: DeploymentOwnerProfile | null,
  supportPhoneMobile = true,
): Promise<ResolvedCardPhone> {
  if (cardSubject?.cardIncludePhone === false) {
    return { raw: '', mobile: false };
  }
  const fromSubject = cardSubject?.phone?.trim() || '';
  if (fromSubject) {
    return { raw: fromSubject, mobile: cardSubject?.cardPhoneMobile !== false };
  }
  const fromCompany = supportPhone?.trim() || '';
  if (fromCompany) {
    return { raw: fromCompany, mobile: supportPhoneMobile !== false };
  }
  const owner = await getDeploymentOwnerProfile(context);
  const fromOwner = owner?.phone?.trim() || '';
  if (fromOwner) {
    return { raw: fromOwner, mobile: owner?.cardPhoneMobile !== false };
  }
  const fromEnv = (serverEnv('OWNER_PHONE') ?? '').trim();
  if (fromEnv) return { raw: fromEnv, mobile: true };
  return { raw: DEFAULT_SUPPORT_PHONE, mobile: true };
}

export async function resolveCardPhoneRaw(
  context: APIContext,
  supportPhone?: string | null,
  cardSubject?: DeploymentOwnerProfile | null,
): Promise<string> {
  return (await resolveCardPhone(context, supportPhone, cardSubject)).raw;
}
