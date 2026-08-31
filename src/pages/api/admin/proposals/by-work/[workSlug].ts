/**
 * Resolve a sales proposal linked to a work project slug.
 */
import type { APIContext } from 'astro';
import { jsonResponse } from '../../../../../lib/apiResponse';
import { requireDeploymentOwner } from '../../../../../lib/deploymentOwner';
import { isCanonicalReaveInstall } from '../../../../../lib/installConfig';
import { findProposalByWorkSlug } from '../../../../../lib/proposalsStore';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  if (!isCanonicalReaveInstall()) return jsonResponse({ ok: false, error: 'Not found' }, 404);
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  const workSlug = String(context.params.workSlug || '').trim();
  const proposal = await findProposalByWorkSlug(workSlug);
  if (!proposal) return jsonResponse({ ok: true, proposal: null });

  return jsonResponse({
    ok: true,
    proposal,
    publicUrl: `${new URL(context.request.url).origin}/proposal/${encodeURIComponent(proposal.slug)}`,
  });
}
