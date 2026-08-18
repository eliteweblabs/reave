import { clerkAuthModule } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

/**
 * Clerk Authentication plugin — core on every package, not an optional module.
 *
 * Active when CLERK_SECRET_KEY is set (per-app Backend API).
 * Clerk does not allow system-level access — no workspace master key.
 */
export const clerkAuthPlugin: ReavePlugin = {
  id: 'clerk-auth',
  configured: () => Boolean(process.env.CLERK_SECRET_KEY?.trim()),
  agentTools: clerkAuthModule,
};
