/**
 * NFC /card can show the deployment owner (default) or an active staff member via ?user=<clerkUserId>.
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
import { listStaffMembers } from './staffMembers';

export function parseCardUserParam(raw: string | null | undefined): string | null {
  const id = raw?.trim() || '';
  if (!id.startsWith('user_')) return null;
  return id;
}

export function cardPathForUserId(userId: string | null | undefined): string {
  const id = userId?.trim() || '';
  if (!id) return '/card';
  return `/card?user=${encodeURIComponent(id)}`;
}

export type ResolvedCardSubject = {
  userId: string | null;
  profile: DeploymentOwnerProfile | null;
  /** True when URL has no ?user= or points at the install owner. */
  isPrimary: boolean;
};

async function isActiveStaffClerkUser(userId: string): Promise<boolean> {
  const members = await listStaffMembers({ includeRevoked: false });
  return members.some((m) => m.status === 'active' && m.userId === userId);
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

export async function resolveCardSubject(
  context: APIContext,
  userIdParam: string | null,
): Promise<ResolvedCardSubject> {
  const ownerProfile = await getDeploymentOwnerProfile(context);
  const ownerId = agentAlertUserId();

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
