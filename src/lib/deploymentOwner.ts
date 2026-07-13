/**
 * Deployment owner — the single admin who can manage plugins and other owner-only UI.
 * Set ADMIN_USERNAME per deployment (defaults to Reave).
 */
import type { APIContext } from 'astro';
import { clerkClient } from '@clerk/astro/server';
import { serverEnv } from './serverEnv';

export type ClerkUserLike = {
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export function deploymentOwnerUsername(): string {
  return serverEnv('ADMIN_USERNAME')?.trim() || 'Reave';
}

export function userDisplayNames(user: ClerkUserLike): string[] {
  const names: string[] = [];
  if (user.username?.trim()) names.push(user.username.trim());
  if (user.firstName?.trim()) names.push(user.firstName.trim());
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (full) names.push(full);
  return names;
}

export function isDeploymentOwnerUser(user: ClerkUserLike): boolean {
  const target = deploymentOwnerUsername().toLowerCase();
  return userDisplayNames(user).some((name) => name.toLowerCase() === target);
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
  const user = await getAuthUser(context);
  if (!user || !isDeploymentOwnerUser(user)) {
    return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return { userId };
}
