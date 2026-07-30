import type { APIRoute } from 'astro';

/** Public liveness probe for Railway deploy healthchecks (no auth). */
export const prerender = false;

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
