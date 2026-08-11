/**
 * Shared JSON Response helper for API routes.
 * Replaces 100+ duplicated local `function json()` definitions.
 */

export type JsonResponseOptions = {
  /** Extra headers merged into the response (e.g. Retry-After). */
  headers?: Record<string, string>;
  /** When false, omit Cache-Control: no-store (rare — most APIs should stay no-store). */
  cacheable?: boolean;
};

export function json(
  body: unknown,
  status = 200,
  options?: JsonResponseOptions | Record<string, string>,
): Response {
  const opts: JsonResponseOptions =
    options && !('cacheable' in options) && !('headers' in options)
      ? { headers: options as Record<string, string> }
      : (options as JsonResponseOptions) ?? {};

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.cacheable ? {} : { 'Cache-Control': 'no-store' }),
    ...(opts.headers ?? {}),
  };

  return new Response(JSON.stringify(body), { status, headers });
}
