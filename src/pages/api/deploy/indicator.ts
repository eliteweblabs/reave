/**
 * GET /api/deploy/indicator — Railway deploy snapshot for the header status bulb.
 * Public (no auth) — dev convenience so deploy state is visible without signing in.
 */
import type { APIContext } from 'astro';
import {
  chatDeployLockMessage,
  deployIndicatorTone,
  deployTooltip,
  getDeployStatus,
  isChatLockedForDeploy,
} from '../../../lib/deployStatus';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(_context: APIContext): Promise<Response> {
  const deploy = await getDeployStatus().catch(() => null);
  if (!deploy) {
    return json({ ok: true, deploy: null });
  }

  const chatLocked = isChatLockedForDeploy(deploy);

  return json({
    ok: true,
    deploy: {
      state: deploy.state,
      tone: deployIndicatorTone(deploy.state),
      tooltip: deployTooltip(deploy),
      deployedShort: deploy.deployed_short,
      deployedAt: deploy.deployed_at,
      upToDate: deploy.up_to_date,
      chatLocked,
      chatLockMessage: chatLocked ? chatDeployLockMessage(deploy) : null,
    },
  });
}
