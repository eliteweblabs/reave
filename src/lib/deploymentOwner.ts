/**
 * Deployment owner — the single admin who can manage plugins and other owner-only UI.
 * Match via AGENT_ALERT_USER_ID (Clerk user id), or ADMIN_USERNAME (defaults to Reave).
 */
import type { APIContext } from 'astro';
import { clerkClient } from '@clerk/astro/server';
import { agentAlertUserId } from './adminAgentAlert';
import { serverEnv } from './serverEnv';

export type ClerkUserLike = {
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  emailAddresses?: Array<{ emailAddress?: string | null }> | null;
};

export function deploymentOwnerUsernames(): string[] {
  const raw = serverEnv('ADMIN_USERNAME')?.trim() || 'Reave';
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** @deprecated Use deploymentOwnerUsernames() */
export function deploymentOwnerUsername(): string {
  return deploymentOwnerUsernames()[0] ?? 'Reave';
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
  const user = await getAuthUser(context);
  if (!user) return false;
  return isDeploymentOwnerUser(user);
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
  const user = await getAuthUser(context);
  if (!user || !isDeploymentOwnerUser(user)) {
    return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return { userId };
}
