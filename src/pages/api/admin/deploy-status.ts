/**
 * GET /api/admin/deploy-status — lightweight deploy snapshot for the topbar indicator.
 * Public (no auth) — dev convenience so deploy state is visible without signing in.
 */

import type { APIContext } from 'astro';
import {
  deployIndicatorTone,
  deployTooltip,
  formatDeployDateEastern,
  getDeployStatus,
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

  return json({
    ok: true,
    deploy: {
      state: deploy.state,
      tone: deployIndicatorTone(deploy.state),
      tooltip: deployTooltip(deploy),
      deployedShort: deploy.deployed_short,
      deployedAt: deploy.deployed_at,
      deployedAtEastern: formatDeployDateEastern(deploy.deployed_at),
      upToDate: deploy.up_to_date,
    },
  });
}
