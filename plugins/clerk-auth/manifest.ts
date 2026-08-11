import { clerkAuthModule } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

/**
 * Clerk Authentication plugin.
 *
 * Enabled when CLERK_SECRET_KEY or CLERK_PLATFORM_KEY is set.
 * - CLERK_SECRET_KEY  → Backend API (users, sessions, orgs, instance status)
 * - CLERK_PLATFORM_KEY → Platform API (create/list/delete apps, get keys)
 *   Platform API requires a Clerk Pro or Enterprise account.
 */
export const clerkAuthPlugin: ReavePlugin = {
  id: 'clerk-auth',
  feature: 'clerk_auth',
  configured: () =>
    Boolean(process.env.CLERK_SECRET_KEY?.trim() || process.env.CLERK_PLATFORM_KEY?.trim()),
  agentTools: clerkAuthModule,
};
