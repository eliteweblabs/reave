import type { APIRoute } from 'astro';
import { isClerkFrontendConfigured, isClerkConfigured } from '../../../lib/clerkClient';
import { isProcessDraining } from '../../../lib/processDrain';

/** Public liveness probe for Railway deploy healthchecks (no auth). */
export const prerender = false;

export const GET: APIRoute = async () => {
  // Old replica: refuse the probe once SIGTERM starts drain so Railway does not
  // keep routing to a process that is only finishing in-flight agent work.
  // New replica is not draining, so cutover healthchecks still succeed.
  if (isProcessDraining()) {
    return new Response(JSON.stringify({ ok: false, draining: true }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }

  void import('../../../lib/calcomIdentitySync')
    .then((m) => m.ensureCalcomIdentityScheduler())
    .catch(() => undefined);

  // If a chat registered a deploy-resume and the success webhook missed this
  // replica, pick it up as soon as the new deploy is healthy.
  void import('../../../lib/deployResume')
    .then((m) => m.maybeTriggerDeployResumeOnNewReplica())
    .catch(() => undefined);

  return new Response(
    JSON.stringify({
      ok: true,
      clerk: {
        secret: isClerkConfigured(),
        publishable: isClerkFrontendConfigured(),
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    },
  );
};
