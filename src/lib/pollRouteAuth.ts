import type { APIContext } from 'astro';
import { requireDashboardUser } from './dashboardAuth';
import { secretMatches } from './secretCompare';

function pollSecretFromRequest(request: Request, queryKey: string | null): string | null {
  if (queryKey) return queryKey;
  const headerSecret = request.headers.get('X-Poll-Secret')?.trim();
  if (headerSecret) return headerSecret;
  const auth = request.headers.get('Authorization')?.trim() ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim() || null;
  }
  return null;
}

/**
 * Authorize cron poll endpoints: valid poll secret (query, X-Poll-Secret, or Bearer) OR deployment owner session.
 */
export async function authorizePollOrOwner(
  context: APIContext,
  queryKey: string | null,
  getExpectedSecret: () => string | null | undefined,
): Promise<{ via: 'key' | 'owner'; userId?: string } | Response> {
  const key = pollSecretFromRequest(context.request, queryKey);
  if (secretMatches(key, getExpectedSecret())) {
    return { via: 'key' };
  }
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  return { via: 'owner', userId: auth.userId };
}
