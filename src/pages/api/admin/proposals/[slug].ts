/**
 * Owner-only sales proposal editor — demo URL, Crater invoice link, publish toggle.
 * Official reave.app only.
 */
import type { APIContext } from 'astro';
import { jsonResponse } from '../../../../lib/apiResponse';
import { requireDeploymentOwner } from '../../../../lib/deploymentOwner';
import { isCanonicalReaveInstall } from '../../../../lib/installConfig';
import {
  getSalesProposal,
  proposalsStorageBackend,
  saveSalesProposal,
  type SalesProposal,
} from '../../../../lib/proposalsStore';

export const prerender = false;

function hostDenied(): Response | null {
  if (isCanonicalReaveInstall()) return null;
  return jsonResponse({ ok: false, error: 'Not found' }, 404);
}

function pickPatch(body: Record<string, unknown>): Partial<SalesProposal> {
  const patch: Partial<SalesProposal> = {};
  if (typeof body.demoUrl === 'string') patch.demoUrl = body.demoUrl.trim();
  if (body.invoiceUrl === null || body.invoiceUrl === '') patch.invoiceUrl = null;
  else if (typeof body.invoiceUrl === 'string') patch.invoiceUrl = body.invoiceUrl.trim();
  if (typeof body.published === 'boolean') patch.published = body.published;
  if (typeof body.priceLabel === 'string') patch.priceLabel = body.priceLabel.trim();
  if (typeof body.priceNote === 'string') patch.priceNote = body.priceNote.trim();
  if (typeof body.headline === 'string') patch.headline = body.headline.trim();
  if (typeof body.lede === 'string') patch.lede = body.lede.trim();
  if (typeof body.workSlug === 'string') patch.workSlug = body.workSlug.trim() || null;
  return patch;
}

export async function GET(context: APIContext): Promise<Response> {
  const denied = hostDenied();
  if (denied) return denied;
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  const slug = String(context.params.slug || '').trim();
  const proposal = await getSalesProposal(slug);
  if (!proposal) return jsonResponse({ ok: false, error: 'Proposal not found' }, 404);

  return jsonResponse({
    ok: true,
    backend: proposalsStorageBackend(),
    proposal,
    publicUrl: `${new URL(context.request.url).origin}/proposal/${encodeURIComponent(slug)}`,
  });
}

export async function PUT(context: APIContext): Promise<Response> {
  const denied = hostDenied();
  if (denied) return denied;
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  const slug = String(context.params.slug || '').trim();
  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const updated = await saveSalesProposal(slug, pickPatch(body));
  if (!updated) return jsonResponse({ ok: false, error: 'Proposal not found' }, 404);

  return jsonResponse({
    ok: true,
    proposal: updated,
    publicUrl: `${new URL(context.request.url).origin}/proposal/${encodeURIComponent(slug)}`,
  });
}
