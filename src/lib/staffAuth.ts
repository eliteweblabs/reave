/**
 * Dashboard access: deployment owner OR active staff invite.
 */
import type { APIContext } from 'astro';
import { clerkClient } from '@clerk/astro/server';
import {
  getAuthUser,
  isDeploymentOwner,
  isDeploymentOwnerId,
  requireDeploymentOwner,
} from './deploymentOwner';
import {
  activateStaffForUser,
  getStaffByUserId,
  type StaffMember,
} from './staffMembers';

export type DashboardRole = 'owner' | 'staff';

export type DashboardAuth = {
  userId: string;
  role: DashboardRole;
  staff?: StaffMember;
};

async function primaryEmailForUser(
  context: APIContext,
  userId: string,
): Promise<string> {
  try {
    const user = await clerkClient(context).users.getUser(userId);
    return user.emailAddresses?.[0]?.emailAddress?.trim() || '';
  } catch {
    return '';
  }
}

/** Resolve staff membership, linking Clerk user id on first sign-in after invite. */
export async function resolveStaffMember(
  context: APIContext,
  userId: string,
): Promise<StaffMember | null> {
  const byId = await getStaffByUserId(userId);
  if (byId) return byId;

  const email = await primaryEmailForUser(context, userId);
  if (!email) return null;
  return activateStaffForUser({ userId, email });
}

export async function isActiveStaff(context: APIContext): Promise<boolean> {
  const { userId } = context.locals.auth();
  if (!userId) return false;
  if (await isDeploymentOwner(context)) return false;
  const staff = await resolveStaffMember(context, userId);
  return Boolean(staff && staff.status === 'active');
}

export async function getDashboardAuth(
  context: APIContext,
): Promise<DashboardAuth | null> {
  const { userId } = context.locals.auth();
  if (!userId) return null;
  if (isDeploymentOwnerId(userId) || (await isDeploymentOwner(context))) {
    return { userId, role: 'owner' };
  }
  const staff = await resolveStaffMember(context, userId);
  if (staff && staff.status === 'active') {
    return { userId, role: 'staff', staff };
  }
  return null;
}

export async function canAccessDashboard(context: APIContext): Promise<boolean> {
  return Boolean(await getDashboardAuth(context));
}

/**
 * Owner or active staff. Prefer this for day-to-day admin APIs.
 * Keep requireDeploymentOwner for install management (catalog, deploy, company, team).
 */
export async function requireDashboardUser(
  context: APIContext,
): Promise<DashboardAuth | Response> {
  const { userId } = context.locals.auth();
  if (!userId) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const auth = await getDashboardAuth(context);
  if (auth) return auth;
  return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Owner-only — wraps deploymentOwner for call-site clarity. */
export async function requireOwnerUser(
  context: APIContext,
): Promise<{ userId: string } | Response> {
  return requireDeploymentOwner(context);
}

export async function getDashboardRole(
  context: APIContext,
): Promise<DashboardRole | null> {
  const auth = await getDashboardAuth(context);
  return auth?.role ?? null;
}

/** Convenience for SSR pages that already loaded Clerk user. */
export async function dashboardRoleForUserId(
  context: APIContext,
  userId: string | null | undefined,
): Promise<DashboardRole | null> {
  if (!userId) return null;
  if (await isDeploymentOwner(context)) return 'owner';
  const staff = await resolveStaffMember(context, userId);
  if (staff?.status === 'active') return 'staff';
  return null;
}

export { getAuthUser };
