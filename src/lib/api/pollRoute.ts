/**
 * Factory for cron poll API routes (auth + feature gate + shared JSON responses).
 */
import type { APIContext, APIRoute } from 'astro';
import { hasFeature, type FeatureId } from '../features';
import { authorizePollOrOwner } from '../pollRouteAuth';
import { jsonResponse } from '../apiResponse';

export type PollRouteOptions = {
  feature: FeatureId;
  secret: () => string | null | undefined;
  ensureScheduler?: () => void;
  run: (
    context: APIContext,
    auth: { via: 'key' | 'owner'; userId?: string },
  ) => Promise<{ body: unknown; status?: number }>;
};

export function createPollRoute(opts: PollRouteOptions): { GET: APIRoute; POST: APIRoute } {
  const handler: APIRoute = async (context) => {
    const key = context.url.searchParams.get('key')?.trim() ?? null;
    const auth = await authorizePollOrOwner(context, key, opts.secret);
    if (auth instanceof Response) return auth;

    if (!hasFeature(opts.feature)) {
      return jsonResponse({ ok: false, error: `${opts.feature} not enabled` }, 404);
    }

    opts.ensureScheduler?.();
    const result = await opts.run(context, auth);
    return jsonResponse(result.body, result.status ?? 200);
  };

  return { GET: handler, POST: handler };
}
