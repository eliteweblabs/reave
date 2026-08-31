/**
 * Public proposal payload for demo sheets and lightweight clients.
 */
import type { APIContext } from 'astro';
import { jsonResponse } from '../../../lib/apiResponse';
import {
  getPublicSalesProposal,
  proposalBodyMarkdown,
} from '../../../lib/proposalsStore';
import { renderDocumentMarkdown } from '../../../lib/renderDocumentMarkdown';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const slug = String(context.params.slug || '').trim();
  if (!slug) return jsonResponse({ ok: false, error: 'Missing slug' }, 400);

  const proposal = await getPublicSalesProposal(slug);
  if (!proposal) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  const bodyMarkdown = await proposalBodyMarkdown(proposal);
  const bodyHtml = bodyMarkdown ? await renderDocumentMarkdown(bodyMarkdown) : '';
  const origin = new URL(context.request.url).origin;

  return jsonResponse({
    ok: true,
    proposal: {
      slug: proposal.slug,
      title: proposal.title,
      clientName: proposal.clientName,
      headline: proposal.headline,
      lede: proposal.lede,
      demoUrl: proposal.demoUrl,
      invoiceUrl: proposal.invoiceUrl,
      priceLabel: proposal.priceLabel,
      priceNote: proposal.priceNote,
      includes: proposal.includes,
      publicUrl: `${origin}/proposal/${encodeURIComponent(proposal.slug)}`,
    },
    bodyHtml,
  });
}
