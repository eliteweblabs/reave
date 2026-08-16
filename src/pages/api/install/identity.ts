/**
 * GET /api/install/identity — public install defaults from the REΛVE node
 * (name, username, email, icon). Siblings and the Cal.com pickup use this
 * instead of re-typing onboarding fields.
 */
import type { APIRoute } from 'astro';
import { resolveInstallIdentity } from '../../../lib/installIdentity';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const identity = await resolveInstallIdentity(request);
  return new Response(JSON.stringify({ ok: true, identity }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
    },
  });
};
