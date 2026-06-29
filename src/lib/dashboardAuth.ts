import type { APIContext } from 'astro';

function unauthorized(): Response {
  return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** Require a signed-in Clerk user for dashboard API routes. */
export function requireDashboardUser(context: APIContext): { userId: string } | Response {
  const auth = context.locals.auth?.();
  const userId = auth?.userId;
  if (!userId) return unauthorized();
  return { userId };
}
