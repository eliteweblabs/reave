import type { APIContext, APIRoute } from 'astro';
import { jsonResponse } from '../apiResponse';
import { authorizePollOrOwner } from '../pollRouteAuth';

export type PollAuth = { via: 'key' | 'owner'; userId?: string };

export type PollRouteOptions = {
  getSecret: () => string | null | undefined;
  ensureScheduler?: () => void;
  feature?: { check: () => boolean; error: string };
  run: (context: APIContext, auth: PollAuth) => Promise<unknown>;
  mapStatus?: (result: unknown) => number;
};

export function createPollRoute(opts: PollRouteOptions): APIRoute {
  const handler: APIRoute = async (context) => {
    const key = context.url.searchParams.get('key')?.trim() ?? null;
    const auth = await authorizePollOrOwner(context, key, opts.getSecret);
    if (auth instanceof Response) return auth;

    if (opts.feature && !opts.feature.check()) {
      return jsonResponse({ ok: false, error: opts.feature.error }, 404);
    }

    opts.ensureScheduler?.();
    const result = await opts.run(context, auth);
    const status = opts.mapStatus?.(result) ?? 200;
    return jsonResponse(result, status);
  };

  return handler;
}
