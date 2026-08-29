/**
 * GET /api/deploy/indicator — Railway deploy snapshot for the header status bulb.
 * Requires deployment owner session unless DEPLOY_STATUS_PUBLIC=1.
 */
import type { APIContext } from 'astro';
import {
  chatDeployLockMessage,
  deployIndicatorTone,
  deployTooltip,
  getDeployStatus,
  isChatLockedForDeploy,
} from '../../../lib/deployStatus';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { serverEnv } from '../../../lib/serverEnv';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  if (serverEnv('DEPLOY_STATUS_PUBLIC') !== '1') {
    const auth = await requireDashboardUser(context);
    if (auth instanceof Response) return auth;
  }

  const deploy = await getDeployStatus().catch(() => null);
  if (!deploy) {
    return jsonResponse({ ok: true, deploy: null });
  }

  const chatLocked = isChatLockedForDeploy(deploy);

  return jsonResponse({
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
