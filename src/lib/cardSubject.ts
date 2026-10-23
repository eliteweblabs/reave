/**
 * NFC /card can show the deployment owner (default), a staff member by
 * ?first=&last=, or legacy ?user=<clerkUserId>.
 */
import type { APIContext } from 'astro';
import { clerkClient } from '@clerk/astro/server';
import { agentAlertUserId } from './adminAgentAlert';
import {
  clerkUserToContactProfile,
  getDeploymentOwnerProfile,
  isDeploymentOwnerId,
  type DeploymentOwnerProfile,
} from './deploymentOwner';
import {
  getStaffByName,
  listStaffMembers,
  normalizeStaffNamePart,
  type StaffMember,
} from './staffMembers';

export function parseCardUserParam(raw: string | null | undefined): string | null {
  const id = raw?.trim() || '';
  if (!id.startsWith('user_')) return null;
  return id;
}

export function parseCardNameParams(params: {
  get(name: string): string | null;
}): { first: string; last: string } | null {
  const first = normalizeStaffNamePart(params.get('first'));
  const last = normalizeStaffNamePart(params.get('last'));
  if (!first || !last) return null;
  return { first, last };
}

export function cardPathForUserId(userId: string | null | undefined): string {
  const id = userId?.trim() || '';
  if (!id) return '/card';
  return `/card?user=${encodeURIComponent(id)}`;
}

export function cardPathForStaffNames(firstName: string, lastName: string): string {
  const first = normalizeStaffNamePart(firstName);
  const last = normalizeStaffNamePart(lastName);
  if (!first || !last) return '/card';
  return `/card?first=${encodeURIComponent(first)}&last=${encodeURIComponent(last)}`;
}

/** Preferred NFC URL — first + last when set, else legacy Clerk user id. */
export function cardPathForStaffMember(member: StaffMember): string | null {
  if (member.status === 'revoked') return null;
  if (member.firstName.trim() && member.lastName.trim()) {
    return cardPathForStaffNames(member.firstName, member.lastName);
  }
  if (member.status === 'active' && member.userId) {
    return cardPathForUserId(member.userId);
  }
  return null;
}

export type ResolvedCardSubject = {
  userId: string | null;
  profile: DeploymentOwnerProfile | null;
  /** True when URL has no ?user= or points at the install owner. */
  isPrimary: boolean;
};

function staffMemberToContactProfile(member: StaffMember): DeploymentOwnerProfile {
  const firstName = member.firstName.trim();
  const lastName = member.lastName.trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return {
    firstName,
    lastName,
    fullName,
    email: member.email,
    phone: '',
    cardPhoneMobile: true,
    address: '',
    timezone: '',
  };
}

async function isActiveStaffClerkUser(userId: string): Promise<boolean> {
  const members = await listStaffMembers({ includeRevoked: false });
  return members.some((m) => m.status === 'active' && m.userId === userId);
}

function isCardEligibleStaffMember(member: StaffMember | null): member is StaffMember {
  return Boolean(member && member.status !== 'revoked');
}

export async function isCardEligibleClerkUserId(
  context: APIContext,
  userId: string,
): Promise<boolean> {
  if (isDeploymentOwnerId(userId)) return true;
  return isActiveStaffClerkUser(userId);
}

export async function getContactProfileForUserId(
  context: APIContext,
  userId: string,
): Promise<DeploymentOwnerProfile | null> {
  try {
    const user = await clerkClient(context).users.getUser(userId);
    return clerkUserToContactProfile(user);
  } catch {
    return null;
  }
}

async function resolveStaffCardSubject(
  context: APIContext,
  staff: StaffMember,
): Promise<ResolvedCardSubject> {
  if (staff.userId) {
    const profile = await getContactProfileForUserId(context, staff.userId);
    if (profile) {
      return { userId: staff.userId, profile, isPrimary: false };
    }
  }
  return {
    userId: staff.userId,
    profile: staffMemberToContactProfile(staff),
    isPrimary: false,
  };
}

export async function resolveCardSubject(
  context: APIContext,
  opts: {
    userIdParam?: string | null;
    firstNameParam?: string | null;
    lastNameParam?: string | null;
  },
): Promise<ResolvedCardSubject> {
  const ownerProfile = await getDeploymentOwnerProfile(context);
  const ownerId = agentAlertUserId();

  const nameFirst = normalizeStaffNamePart(opts.firstNameParam);
  const nameLast = normalizeStaffNamePart(opts.lastNameParam);
  if (nameFirst && nameLast) {
    const staff = await getStaffByName(nameFirst, nameLast);
    if (isCardEligibleStaffMember(staff)) {
      return resolveStaffCardSubject(context, staff);
    }
  }

  const userIdParam = opts.userIdParam ?? null;
  if (!userIdParam) {
    return { userId: ownerId ?? null, profile: ownerProfile, isPrimary: true };
  }

  if (!(await isCardEligibleClerkUserId(context, userIdParam))) {
    return { userId: ownerId ?? null, profile: ownerProfile, isPrimary: true };
  }

  if (isDeploymentOwnerId(userIdParam)) {
    return { userId: userIdParam, profile: ownerProfile, isPrimary: true };
  }

  const profile = await getContactProfileForUserId(context, userIdParam);
  return { userId: userIdParam, profile, isPrimary: false };
}

export function cardContactDisplayName(
  profile: DeploymentOwnerProfile | null,
  companyName: string,
): string {
  const org = companyName.trim() || 'Contact';
  const fromProfile =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() ||
    profile?.fullName?.trim() ||
    '';
  return fromProfile || org;
}
