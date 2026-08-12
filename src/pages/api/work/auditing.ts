/**
 * GET /api/work/auditing — slugs with an in-flight Siri audit (Work tab spinner).
 */

import type { APIContext } from 'astro';
import { json } from '../../../lib/apiJson';
import { getAgentProgress } from '../../../lib/agentProgress';
import { labelForAgentTool } from '../../../lib/agentToolLabels';
import { listSiriAuditRuns, siriAuditThreadId } from '../../../lib/siriAuditRuns';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const auditing = listSiriAuditRuns(userId).map((run) => {
    const progress = getAgentProgress(userId, siriAuditThreadId(run.slug));
    const toolLabel = progress?.toolLabel || (progress?.tool ? labelForAgentTool(progress.tool) : null);
    return {
      slug: run.slug,
      tier: run.tier,
      label: run.label,
      startedAt: run.startedAt,
      progress: progress
        ? {
            phase: progress.phase,
            tool: progress.tool ?? null,
            toolLabel: toolLabel ?? null,
            round: progress.round ?? null,
          }
        : null,
    };
  });

  return json({ ok: true, auditing });
}
