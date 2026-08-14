import type { APIContext } from 'astro';
import { cachedCompanyBrandName } from './companyConfig';
import { SITE } from '../config/site';
import { clerkClient } from '@clerk/astro/server';
import { agentAlertUserId } from './adminAgentAlert';
import { serverEnv } from './serverEnv';

export const DEFAULT_DEPLOYMENT_TIMEZONE = 'America/New_York';

export type ClerkUserLike = {
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  emailAddresses?: Array<{ emailAddress?: string | null }> | null;
};

export function deploymentOwnerUsernames(): string[] {
  const raw = serverEnv('ADMIN_USERNAME')?.trim() || cachedCompanyBrandName() || SITE.name;
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** @deprecated Use deploymentOwnerUsernames() */
export function deploymentOwnerUsername(): string {
  return deploymentOwnerUsernames()[0] ?? SITE.name;
}

export function userDisplayNames(user: ClerkUserLike): string[] {
  const names: string[] = [];
  if (user.username?.trim()) names.push(user.username.trim());
  if (user.firstName?.trim()) names.push(user.firstName.trim());
  if (user.lastName?.trim()) names.push(user.lastName.trim());
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (full) names.push(full);
  const email = user.emailAddresses?.[0]?.emailAddress?.trim();
  if (email) {
    names.push(email);
    const local = email.split('@')[0]?.trim();
    if (local) names.push(local);
  }
  return names;
}

export function isDeploymentOwnerUser(user: ClerkUserLike): boolean {
  const targets = new Set(deploymentOwnerUsernames().map((name) => name.toLowerCase()));
  return userDisplayNames(user).some((name) => targets.has(name.toLowerCase()));
}

export function isDeploymentOwnerId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const ownerId = agentAlertUserId();
  return Boolean(ownerId && ownerId === userId);
}

export async function getAuthUser(context: APIContext) {
  const { userId } = context.locals.auth();
  if (!userId) return null;
  try {
    return await clerkClient(context).users.getUser(userId);
  } catch {
    return null;
  }
}

export async function isDeploymentOwner(context: APIContext): Promise<boolean> {
  const { userId } = context.locals.auth();
  if (!userId) return false;
  if (isDeploymentOwnerId(userId)) return true;
  // When AGENT_ALERT_USER_ID is configured, owner access is ID-only — do not
  // fall back to username/email matching (prevents Clerk account squatting).
  if (agentAlertUserId()) return false;
  const user = await getAuthUser(context);
  if (!user) return false;
  return isDeploymentOwnerUser(user);
}

/** Returns a 403 Response when the viewer is signed in but not the deployment owner. */
export async function denyUnlessDeploymentOwner(context: APIContext): Promise<Response | null> {
  const { userId } = context.locals.auth();
  if (!userId) return null;
  if (await isDeploymentOwner(context)) return null;
  return context.redirect('/admin/');
}

export async function requireDeploymentOwner(
  context: APIContext,
): Promise<{ userId: string } | Response> {
  const { userId } = context.locals.auth();
  if (!userId) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (isDeploymentOwnerId(userId)) return { userId };
  if (agentAlertUserId()) {
    return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const user = await getAuthUser(context);
  if (!user || !isDeploymentOwnerUser(user)) {
    return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return { userId };
}

export type DeploymentOwnerProfile = {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  timezone: string;
};

function profileFromClerkUser(user: {
  firstName?: string | null;
  lastName?: string | null;
  emailAddresses?: Array<{ emailAddress?: string | null }> | null;
  publicMetadata?: unknown;
}): DeploymentOwnerProfile {
  const meta = (user.publicMetadata ?? {}) as Record<string, string>;
  const firstName = (user.firstName ?? '').trim();
  const lastName = (user.lastName ?? '').trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return {
    firstName,
    lastName,
    fullName,
    email: user.emailAddresses?.[0]?.emailAddress?.trim() || '',
    phone: (meta.phone ?? '').trim(),
    address: (meta.address ?? '').trim(),
    timezone: (meta.timezone ?? '').trim(),
  };
}

/** Public contact card fields from the deployment owner (Admin → Profile). */
export async function getDeploymentOwnerProfile(
  context: APIContext,
): Promise<DeploymentOwnerProfile | null> {
  try {
    const client = clerkClient(context);
    const ownerId = agentAlertUserId();
    if (ownerId) {
      try {
        const user = await client.users.getUser(ownerId);
        return profileFromClerkUser(user);
      } catch {
        /* fall through */
      }
    }

    let offset = 0;
    for (let page = 0; page < 5; page++) {
      const batch = await client.users.getUserList({ limit: 100, offset });
      const match = batch.data.find((user) => isDeploymentOwnerUser(user));
      if (match) return profileFromClerkUser(match);
      if (batch.data.length < 100) break;
      offset += batch.data.length;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function fetchClerkUserPublicMetadata(userId: string): Promise<Record<string, string>> {
  const secretKey = serverEnv('CLERK_SECRET_KEY') || serverEnv('CLERK_BACKEND_API_KEY');
  if (!secretKey) return {};
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) return {};
    const data = (await res.json()) as Record<string, unknown>;
    return ((data.public_metadata ?? {}) as Record<string, string>) || {};
  } catch {
    return {};
  }
}

/** Admin → Profile time zone; defaults to Eastern when unset. */
export async function getDeploymentOwnerTimezone(context?: APIContext): Promise<string> {
  if (context) {
    const profile = await getDeploymentOwnerProfile(context);
    if (profile?.timezone) return profile.timezone;
  }

  const ownerId = agentAlertUserId();
  if (ownerId) {
    const meta = await fetchClerkUserPublicMetadata(ownerId);
    const tz = (meta.timezone ?? '').trim();
    if (tz) return tz;
  }

  return DEFAULT_DEPLOYMENT_TIMEZONE;
}
