/**
 * GET /api/compliance-logos — public list of regulatory / accessibility marks.
 *
 * Curated in `src/lib/complianceLogos.ts`. Simple Icons slugs only when the
 * official mark exists in that package; everything else is text-only.
 */
import type { APIRoute } from 'astro';
import { complianceLogoIconSrc, listComplianceLogos } from '../../lib/complianceLogos';
import { jsonResponse } from '../../lib/apiResponse';

export const prerender = false;

export const GET: APIRoute = async () => {
  const logos = listComplianceLogos().map((logo) => ({
    ...logo,
    iconSrc: complianceLogoIconSrc(logo),
  }));
  return jsonResponse({ ok: true, logos }, 200, { cache: 'public, max-age=300' });
};
